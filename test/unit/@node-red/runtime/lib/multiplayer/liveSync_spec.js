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

var EventEmitter = require("events").EventEmitter;

describe('multiplayer/liveSync', function() {

    var liveSync;
    var mockRuntime;
    var emittedComms;

    beforeEach(function() {
        emittedComms = [];
        mockRuntime = new EventEmitter();
        mockRuntime.events = mockRuntime;
        mockRuntime.log = {
            trace: sinon.stub(),
            warn: sinon.stub(),
            debug: sinon.stub()
        };
        mockRuntime.flows = {
            patchFlows: sinon.stub()
        };

        // Fresh require to reset state
        delete require.cache[require.resolve(NR_TEST_UTILS.resolve("@node-red/runtime/lib/multiplayer/liveSync"))];
        liveSync = NR_TEST_UTILS.require("@node-red/runtime/lib/multiplayer/liveSync");

        mockRuntime.on('comms', function(event) {
            emittedComms.push(event);
        });

        liveSync.init(mockRuntime);
    });

    it('broadcasts livesync/applied on successful change', async function() {
        mockRuntime.flows.patchFlows.resolves({
            rev: "rev-123",
            results: { success: [{nodeId:"n1",tier:0}], failed: [] }
        });

        mockRuntime.emit('comms:message:livesync/change', {
            session: 'session-1',
            user: { username: 'testuser' },
            data: {
                changeId: 'chg_1',
                changes: [
                    { op: 'update', nodeId: 'n1', node: { id: 'n1', x: 50 } }
                ]
            }
        });

        // Allow async to complete
        await new Promise(resolve => setImmediate(resolve));

        mockRuntime.flows.patchFlows.calledOnce.should.be.true();
        emittedComms.length.should.be.greaterThan(0);

        var applied = emittedComms.find(function(e) { return e.topic === 'livesync/applied'; });
        should.exist(applied);
        applied.data.changeId.should.equal('chg_1');
        applied.data.rev.should.equal('rev-123');
        applied.data.changes.should.have.length(1);
    });

    it('sends livesync/error to originator on failure', async function() {
        mockRuntime.flows.patchFlows.rejects(new Error("test failure"));

        mockRuntime.emit('comms:message:livesync/change', {
            session: 'session-1',
            user: { username: 'testuser' },
            data: {
                changeId: 'chg_2',
                changes: [
                    { op: 'remove', nodeId: 'n1' }
                ]
            }
        });

        await new Promise(resolve => setImmediate(resolve));

        var errorMsg = emittedComms.find(function(e) { return e.topic === 'livesync/error'; });
        should.exist(errorMsg);
        errorMsg.data.changeId.should.equal('chg_2');
        errorMsg.data.error.should.equal('test failure');
        errorMsg.session.should.equal('session-1');
    });

    it('sends error for invalid payload', async function() {
        mockRuntime.emit('comms:message:livesync/change', {
            session: 'session-1',
            user: { username: 'testuser' },
            data: { changeId: 'chg_3' }  // missing changes array
        });

        await new Promise(resolve => setImmediate(resolve));

        var errorMsg = emittedComms.find(function(e) { return e.topic === 'livesync/error'; });
        should.exist(errorMsg);
        errorMsg.data.error.should.equal('Invalid change payload');
    });

    it('passes changes array to patchFlows', async function() {
        var changes = [
            { op: 'add', node: { id: 'n5', type: 'test', x: 10, y: 10, z: 't1', wires: [] } },
            { op: 'rewire', nodeId: 'n1', wires: [["n5"]] }
        ];

        mockRuntime.flows.patchFlows.resolves({
            rev: "rev-456",
            results: { success: [{nodeId:"n5"},{nodeId:"n1"}], failed: [] }
        });

        mockRuntime.emit('comms:message:livesync/change', {
            session: 'session-1',
            user: { username: 'testuser' },
            data: { changeId: 'chg_4', changes: changes }
        });

        await new Promise(resolve => setImmediate(resolve));

        var callArgs = mockRuntime.flows.patchFlows.firstCall.args;
        callArgs[0].should.eql(changes);
        callArgs[1].should.eql({ username: 'testuser' });
    });
});
