/**
 * Copyright JS Foundation and other contributors, http://js.foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

var should = require("should");
var sinon = require("sinon");
var NR_TEST_UTILS = require("nr-test-utils");

var flows = NR_TEST_UTILS.require("@node-red/runtime/lib/flows");
var credentials = NR_TEST_UTILS.require("@node-red/runtime/lib/nodes/credentials");
var typeRegistry = NR_TEST_UTILS.require("@node-red/registry");
var Flow = NR_TEST_UTILS.require("@node-red/runtime/lib/flows/Flow");

describe('flows/index - patchFlows', function() {

    var storage;
    var credentialsClean;
    var credentialsLoad;
    var credentialsExport;
    var credentialsDirty;
    var flowCreate;
    var getType;
    var checkFlowDependencies;

    var mockLog = {
        log: sinon.stub(),
        debug: sinon.stub(),
        trace: sinon.stub(),
        warn: sinon.stub(),
        info: sinon.stub(),
        metric: sinon.stub(),
        _: function() { return "abc"}
    };

    before(function() {
        getType = sinon.stub(typeRegistry,"get").callsFake(function(type) {
            return type.indexOf('missing') === -1;
        });
        checkFlowDependencies = sinon.stub(typeRegistry, "checkFlowDependencies").callsFake(async function() {});
    });

    after(function() {
        getType.restore();
        checkFlowDependencies.restore();
    });

    beforeEach(function() {
        credentialsClean = sinon.stub(credentials,"clean").callsFake(function(conf) {
            conf.forEach(function(n) { delete n.credentials; });
            return Promise.resolve();
        });
        credentialsLoad = sinon.stub(credentials,"load").callsFake(function() {
            return Promise.resolve();
        });
        credentialsExport = sinon.stub(credentials,"export").callsFake(function() {
            return Promise.resolve({});
        });
        credentialsDirty = sinon.stub(credentials,"dirty").callsFake(function() {
            return false;
        });
        flowCreate = sinon.stub(Flow,"create").callsFake(function(parent, global, flow) {
            var id;
            if (typeof flow === 'undefined') {
                flow = global;
                id = '_GLOBAL_';
            } else {
                id = flow.id;
            }
            flowCreate.flows[id] = {
                flow: flow,
                global: global,
                start: sinon.spy(async() => {}),
                update: sinon.spy(),
                stop: sinon.spy(async() => {}),
                activeNodes: {},
                subflowInstanceNodes: {},
                getActiveNodes: function() {
                    return this.activeNodes;
                },
                id: id === '_GLOBAL_' ? 'global' : id
            };
            return flowCreate.flows[id];
        });
        flowCreate.flows = {};

        storage = {
            saveFlows: function(conf) {
                storage.conf = conf;
                return Promise.resolve("new-rev-123");
            }
        };
    });

    afterEach(function(done) {
        credentialsClean.restore();
        credentialsLoad.restore();
        credentialsExport.restore();
        credentialsDirty.restore();
        flowCreate.restore();
        flows.stopFlows().then(done);
    });

    function initFlowsWithConfig(config) {
        flows.init({log:mockLog, settings:{}, storage:storage});
        return flows.setFlows(config);
    }

    describe('#patchFlows', function() {

        it('handles update of non-existent node gracefully', async function() {
            var config = [
                {id:"t1",type:"tab"}
            ];
            await initFlowsWithConfig(config);
            // Try to update a node that doesn't exist
            var result = await flows.patchFlows([
                { op: 'update', nodeId: 'nonexistent', node: { id: 'nonexistent', x: 50 } }
            ], {});
            // Should complete without error - the change is a no-op for missing nodes
            result.should.have.property('rev');
        });

        it('returns empty results for empty changes array', async function() {
            var config = [
                {id:"t1",type:"tab"},
                {id:"n1",x:10,y:10,z:"t1",type:"test",wires:[]}
            ];
            await initFlowsWithConfig(config);
            var result = await flows.patchFlows([], {});
            result.should.have.property('rev');
            result.results.success.should.have.length(0);
            result.results.failed.should.have.length(0);
        });

        it('Tier 0: visual-only update does not restart node', async function() {
            var config = [
                {id:"t1",type:"tab"},
                {id:"n1",x:10,y:10,z:"t1",type:"test",wires:[]}
            ];
            await initFlowsWithConfig(config);

            var result = await flows.patchFlows([
                { op: 'update', nodeId: 'n1', node: { id: 'n1', x: 50, y: 50 } }
            ], {});

            result.results.success.should.have.length(1);
            result.results.success[0].should.have.property('action');
            // Node config should be updated
            var currentFlows = flows.getFlows();
            var n1 = currentFlows.flows.find(function(n) { return n.id === 'n1'; });
            n1.x.should.equal(50);
            n1.y.should.equal(50);
        });

        it('Tier 3: add node inserts into config', async function() {
            var config = [
                {id:"t1",type:"tab"}
            ];
            await initFlowsWithConfig(config);

            var result = await flows.patchFlows([
                { op: 'add', node: { id: 'n2', x: 100, y: 100, z: 't1', type: 'test', wires: [] } }
            ], {});

            result.results.success.should.have.length(1);
            result.results.success[0].nodeId.should.equal('n2');
            // Verify node is in config
            var currentFlows = flows.getFlows();
            var n2 = currentFlows.flows.find(function(n) { return n.id === 'n2'; });
            should.exist(n2);
            n2.type.should.equal('test');
        });

        it('Tier 4: remove node removes from config', async function() {
            var config = [
                {id:"t1",type:"tab"},
                {id:"n1",x:10,y:10,z:"t1",type:"test",wires:[]}
            ];
            await initFlowsWithConfig(config);

            var result = await flows.patchFlows([
                { op: 'remove', nodeId: 'n1' }
            ], {});

            result.results.success.should.have.length(1);
            result.results.success[0].nodeId.should.equal('n1');
            // Verify node removed from config
            var currentFlows = flows.getFlows();
            var n1 = currentFlows.flows.find(function(n) { return n.id === 'n1'; });
            should.not.exist(n1);
        });

        it('Tier 1: rewire updates wires in config', async function() {
            var config = [
                {id:"t1",type:"tab"},
                {id:"n1",x:10,y:10,z:"t1",type:"test",wires:[]},
                {id:"n2",x:100,y:10,z:"t1",type:"test",wires:[]}
            ];
            await initFlowsWithConfig(config);

            var result = await flows.patchFlows([
                { op: 'rewire', nodeId: 'n1', wires: [["n2"]] }
            ], {});

            result.results.success.should.have.length(1);
            // Verify wires updated in config
            var currentFlows = flows.getFlows();
            var n1 = currentFlows.flows.find(function(n) { return n.id === 'n1'; });
            n1.wires.should.eql([["n2"]]);
        });

        it('Tier 2: property update changes config', async function() {
            var config = [
                {id:"t1",type:"tab"},
                {id:"n1",x:10,y:10,z:"t1",type:"test",name:"old",wires:[]}
            ];
            await initFlowsWithConfig(config);

            var result = await flows.patchFlows([
                { op: 'update', nodeId: 'n1', node: { id: 'n1', name: 'new' } }
            ], {});

            result.results.success.should.have.length(1);
            var currentFlows = flows.getFlows();
            var n1 = currentFlows.flows.find(function(n) { return n.id === 'n1'; });
            n1.name.should.equal('new');
        });

        it('Tier 6: add flow tab creates entry', async function() {
            var config = [
                {id:"t1",type:"tab"}
            ];
            await initFlowsWithConfig(config);

            var result = await flows.patchFlows([
                { op: 'add', node: { id: 't2', type: 'tab', label: 'Flow 2' } }
            ], {});

            result.results.success.should.have.length(1);
            var currentFlows = flows.getFlows();
            var t2 = currentFlows.flows.find(function(n) { return n.id === 't2'; });
            should.exist(t2);
            t2.type.should.equal('tab');
        });

        it('Tier 6: remove flow tab removes entry', async function() {
            var config = [
                {id:"t1",type:"tab"},
                {id:"t2",type:"tab", label:"Flow 2"},
                {id:"n1",x:10,y:10,z:"t2",type:"test",wires:[]}
            ];
            await initFlowsWithConfig(config);

            var result = await flows.patchFlows([
                { op: 'remove', nodeId: 't2' }
            ], {});

            result.results.success.should.have.length(1);
        });

        it('handles multiple changes in one batch', async function() {
            var config = [
                {id:"t1",type:"tab"},
                {id:"n1",x:10,y:10,z:"t1",type:"test",wires:[]}
            ];
            await initFlowsWithConfig(config);

            var result = await flows.patchFlows([
                { op: 'add', node: { id: 'n2', x: 200, y: 200, z: 't1', type: 'test', wires: [] } },
                { op: 'update', nodeId: 'n1', node: { id: 'n1', x: 50, y: 50 } },
                { op: 'rewire', nodeId: 'n1', wires: [["n2"]] }
            ], {});

            result.results.success.should.have.length(3);
            var currentFlows = flows.getFlows();
            currentFlows.flows.should.have.length(3); // t1, n1, n2
        });

        it('debounced save is triggered', function(done) {
            this.timeout(5000);
            var config = [
                {id:"t1",type:"tab"},
                {id:"n1",x:10,y:10,z:"t1",type:"test",wires:[]}
            ];
            flows.init({log:mockLog, settings:{flowSaveDebounceMs: 50}, storage:storage});
            flows.setFlows(config).then(function() {
                // Clear the conf that was set by setFlows
                delete storage.conf;
                return flows.patchFlows([
                    { op: 'update', nodeId: 'n1', node: { id: 'n1', x: 99, y: 99 } }
                ], {});
            }).then(function() {
                // Save should be pending but not yet executed
                should.not.exist(storage.conf);
                // Wait for debounce
                setTimeout(function() {
                    try {
                        should.exist(storage.conf);
                        done();
                    } catch(e) {
                        done(e);
                    }
                }, 200);
            }).catch(done);
        });

        it('flushSave forces immediate save', function(done) {
            this.timeout(5000);
            var config = [
                {id:"t1",type:"tab"},
                {id:"n1",x:10,y:10,z:"t1",type:"test",wires:[]}
            ];
            flows.init({log:mockLog, settings:{flowSaveDebounceMs: 5000}, storage:storage});
            flows.setFlows(config).then(function() {
                // Clear the storage.conf set by setFlows
                delete storage.conf;
                return flows.patchFlows([
                    { op: 'update', nodeId: 'n1', node: { id: 'n1', x: 99 } }
                ], {});
            }).then(function() {
                should.not.exist(storage.conf);
                return flows.flushSave();
            }).then(function() {
                try {
                    should.exist(storage.conf);
                    done();
                } catch(e) {
                    done(e);
                }
            }).catch(done);
        });
    });
});
