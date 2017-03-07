enum EProtocolType {
    STATE_MUTATE
,   HEARTBEAT
}

const SEQ_BITFIELD_LENGTH = 32;

type IPacket = any[]
type IPacketData = any
type IBitfield = number

interface IIOBox {
        localSeqNum: number
    ,   remoteSeqNum: number
    ,   inboxBitfield: number // based on remoteSeqNum; eg 1110 means we got the remoteSeqNum, missed remoteSeqNum+1, but got remoteSeqNum+2,3,4
    ,   inbox: IPacket[]
    ,   outbox: IPacket[]
    ,   historicalOutbox: IPacket[]
    ,   _acknowledgeSeqNum: (seqNum : number) => void
    ,   preparePacket: (protocolType : EProtocolType, packetData : IPacketData) => IPacket
    ,   receivePacket: (packet : IPacket) => [number, EProtocolType, IPacketData]
    ,   logSeqBitfield: (bitField : number, seqNum : number) => number[]
}

function makeIOBox () : IIOBox {
    function toggleBitfieldIndexOn (bitfield : IBitfield, index : number) : IBitfield {
        return bitfield | (1<<index);
    }
    function toggleBitfieldIndexOff (bitfield : IBitfield, index : number) : IBitfield {
        return bitfield & ~(1<<index);
    }
    function shiftSeqBitfield (bitfield : IBitfield, oldRemoteSeqNum : number, newRemoteSeqNum : number) : IBitfield {
        // ex: 0000 1010, 10, 12 // need to shift by 2 to get 0010 1000
        //          4321
        //     0010 1000
        //     0065 4321
        return bitfield << (newRemoteSeqNum - oldRemoteSeqNum);
    }
    function markPresentInSeqBitfield (bitfield : IBitfield, seqNum : number, remoteSeqNum : number) : IBitfield {
        // seqNum must be less than remoteSeqNum
        // ex: 0000 10, 12 // need to toggle at 2-1 to get 0010
        //return toggleBitfieldIndexOn(bitfield, remoteSeqNum - seqNum - 1);
        return bitfield | (1 << (remoteSeqNum - seqNum - 1)); // inlined
    }
    function seqNumFromPacket (packet : IPacket) : number {
        return packet[1];
    }
    return {
        localSeqNum: 1
    ,   remoteSeqNum: 0
    ,   inboxBitfield: 0 // based on remoteSeqNum; eg 1110 means we got the remoteSeqNum, missed remoteSeqNum+1, but got remoteSeqNum+2,3,4
    ,   inbox: []
    ,   outbox: []
    ,   historicalOutbox: []
    ,   logSeqBitfield: function (bitField : number, seqNum : number) : number[] {
            let acked = [];
            for(var i = 0; i < SEQ_BITFIELD_LENGTH; i++) {
                if (((bitField >> i) & 1) === 1) {
                    let acknowledgedSeqNum = seqNum - 1 - i;
                    acked.push(acknowledgedSeqNum);
                }
            }
            return acked;
        }
    ,   _acknowledgeSeqNum: function (seqNum : number) {
            // We know that the remote has received the packet with this seqNum
            // so we no longer need to send copies of the ones they got
            // we can modify our outbox
            // NOTE(JULIAN): Optimize, maybe by using a sorted list
            let origLen = this.outbox.length;
            for (let i = this.outbox.length-1; i >= 0; i--) {
                if (seqNumFromPacket(this.outbox[i]) === seqNum) {
                    this.historicalOutbox.push(this.outbox[i]); // TODO(JULIAN): Remove
                    this.outbox.splice(i, 1);
                    // console.log(`Ack ${seqNum} Orig:${origLen} New:${this.outbox.length}`);
                    // break;
                }
            }
        }
    ,   preparePacket: function (protocolType : EProtocolType, packetData : any) : IPacket {
            let seqNum = this.localSeqNum++;
            let ack = this.remoteSeqNum;
            let ackBitfield = this.inboxBitfield; // tell them which packets we got
            let packet : IPacket = [protocolType, seqNum, ack, ackBitfield, packetData];
            this.outbox.push(packet);
            return packet;
        }
    ,   receivePacket: function (packet : IPacket) : [number, EProtocolType, IPacketData] {
            this.inbox.push(packet);
            let protocolType = packet[0];
            let seqNum = packet[1];
            // they're telling us which packets they got: ack, and the ackBitfield relative to ack: 33 packet acks total
            let ack = packet[2];
            // console.log(`ACK ---------------------------> ${ack}`);
            this._acknowledgeSeqNum(ack);
            let ackBitfield = packet[3];
            // console.log(`Bitfield: ${JSON.stringify(this.logSeqBitfield(ackBitfield, ack))}; <${ackBitfield}>; ${ack}`);
            for(var i = 0; i < SEQ_BITFIELD_LENGTH; i++) {
                if (((ackBitfield >> i) & 1) === 1) {
                    let acknowledgedSeqNum = ack - 1 - i;
                    this._acknowledgeSeqNum(acknowledgedSeqNum);
                }
            }
            if (seqNum > this.remoteSeqNum) {
                // Shift because there's now a bigger gap
                this.inboxBitfield = shiftSeqBitfield(this.inboxBitfield, this.remoteSeqNum, seqNum);
                this.inboxBitfield = markPresentInSeqBitfield(this.inboxBitfield, this.remoteSeqNum, seqNum);
                this.remoteSeqNum = seqNum;
                // console.log(`UPDATE REMOTE SEQ To ${seqNum}`);
            } else if (seqNum < this.remoteSeqNum) { // if they're equal, we already know that present
                // Mark present
                this.inboxBitfield = markPresentInSeqBitfield(this.inboxBitfield, seqNum, this.remoteSeqNum);
                // console.log(`UPDATE ACK WITH ${seqNum}`);
            }
            let packetData = packet[4];
            return [seqNum, protocolType, packetData];
        }
    }
}

/*
- Each time we send a packet we increase the local sequence number
- When we receive a packet, we check the sequence number of the packet against the remote sequence number.
  If the packet sequence is more recent, we update the remote sequence number.
- When we compose packet headers, the local sequence becomes the sequence number of the packet,
  and the remote sequence becomes the ack. The ack bitfield is calculated by looking into a queue of up to 33 packets,
  containing sequence numbers in the range [remote sequence – 32, remote sequence]. We set bit n (in [1,32]) in
  ack bits to 1 if the sequence number remote sequence – n is in the received queue.
- Additionally, when a packet is received, ack bitfield is scanned and if bit n is set,
  then we acknowledge sequence number packet sequence – n, if it has not been acked already.
*/

enum ECrud {
    CREATE// = 0
,   UPDATE// = 1
,   DELETE// = 2
}

enum EPropertyType {
    EXISTS = 0
,   TYPE// = 1
,   POS// = 2
,   ROT// = 3
,   SCALE// = 4
,   TINT// = 5
}
const PROPERTY_TYPE_LEN = 6;

function makeDeletePayload (id) : IPacketData {
    return [ECrud[ECrud.DELETE], id];
}

function makeUpdatePayload (id, property, value) : IPacketData {
    return [ECrud[ECrud.UPDATE], id, property, value];
}

function makeCreatePayload (id, payload) : IPacketData {
    return [ECrud[ECrud.CREATE], id, payload];
}

function getRandomInt(min /* inclusive */, max /* exclusive */) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min)) + min;
}

function generateRandomStateTransition (state : Object) : IPacketData {
    let id = getRandomInt(0,5);
    // let id = 0;
    if (state.hasOwnProperty(id) && state[id][EPropertyType.EXISTS][VAL_INDEX] === true) {
        if (Math.random() > 0.98) {
            return makeDeletePayload(id);
        } else {
            return makeUpdatePayload(id, getRandomInt(1, PROPERTY_TYPE_LEN), getRandomInt(0,10));
        }
    } else {
        let emptyPayload = new Map<EPropertyType,any>();
        for (let i = 1; i < PROPERTY_TYPE_LEN; i++) {
            emptyPayload.set(i,0);
        }
        return makeCreatePayload(id, emptyPayload);
    }
}

// function makeEndpoint () {
//     return {
//         state: {}
//     ,   commPipes: {} // target -> iobox
//     ,   transferPacket: function (source : IIOBox, destination : IIOBox, protocolType: EProtocolType, packetData : IPacketData) {
//             let packet = source.preparePacket(protocolType, packetData);
//             let obtainedPacketData = destination.receivePacket(packet);
//         }
//     };
// }

interface INode {
    name: string
,   state: Object
,   appliedPackets: IPacket[]
,   commPipes: ICommPipe[]
}

interface ICommPipe {
    from: IIOBox
,   to: IIOBox
,   fromNode: INode
,   toNode: INode
}

function makeNode (name) : INode {
    return {
        name: name
    ,   state: {}
    ,   appliedPackets: []
    ,   commPipes: []
    }
}

const SEQ_INDEX = 0;
const VAL_INDEX = 1;

function makeBlankRecord (seqNum: number) {
    let record = {};
    record[EPropertyType.EXISTS] = [seqNum, true];
    return record;
}

function applyStateMutation (state, force: boolean, seqNum : number, protocolType : EProtocolType, packetData : IPacketData) {
    switch (EProtocolType[protocolType]) {
        case EProtocolType[EProtocolType.HEARTBEAT]:
            break;
        case EProtocolType[EProtocolType.STATE_MUTATE]:
            let crud = packetData[0];
            let id = packetData[1];
            switch (crud) {
                case ECrud[ECrud.UPDATE]:
                    let property = packetData[2];
                    let value = packetData[3];
                    if (!state.hasOwnProperty(id)) {
                        state[id] = makeBlankRecord(seqNum);
                        // NOTE(JULIAN): Object will get created later
                    }
                    if (force || !state[id].hasOwnProperty(property)) {
                        state[id][property] = [seqNum, value];
                    } else if (state[id][property][SEQ_INDEX] < seqNum) {
                        state[id][property][SEQ_INDEX] = seqNum;
                        state[id][property][VAL_INDEX] = value;
                    }
                    break;
                case ECrud[ECrud.CREATE]:
                    if (!state.hasOwnProperty(id)) {
                        state[id] = makeBlankRecord(seqNum);
                    } else if (force || state[id][EPropertyType.EXISTS][SEQ_INDEX] < seqNum) {
                        state[id][EPropertyType.EXISTS][SEQ_INDEX] = seqNum;
                        state[id][EPropertyType.EXISTS][VAL_INDEX] = true;
                    }
                    let payload : Map<EPropertyType, any> = packetData[2];
                    for (let [property,val] of payload) {
                        if (!state[id].hasOwnProperty(property)) {
                            state[id][property] = [seqNum,val];
                        } else if (force || state[id][property][SEQ_INDEX] < seqNum) {
                            state[id][property][SEQ_INDEX] = seqNum;
                            state[id][property][VAL_INDEX] = val;
                        }
                    }
                    break;
                case ECrud[ECrud.DELETE]:
                    if (!state.hasOwnProperty(id)) {
                        state[id] = makeBlankRecord(seqNum);
                        state[id][EPropertyType.EXISTS][VAL_INDEX] = false;
                    } else if (force || state[id][EPropertyType.EXISTS][SEQ_INDEX] < seqNum) {
                        // console.assert(state.hasOwnProperty(id), `Trying to delete when doesn't exist ${id}: ${JSON.stringify(state)}`)
                        state[id][EPropertyType.EXISTS][SEQ_INDEX] = seqNum;
                        state[id][EPropertyType.EXISTS][VAL_INDEX] = false;
                    }
                    break;
            }
            break;
    }
}

function connect (sourceNode : INode, destNode : INode) {
    let a = makeIOBox();
    let b = makeIOBox();
    sourceNode.commPipes.push({from: a, to: b, fromNode: sourceNode, toNode: destNode});
    destNode.commPipes.push({from: b, to: a, fromNode: destNode, toNode: sourceNode});
}

function filterForSeqNums (packets: IPacket[]) {
    let nums = packets.map(function (packet) { return packet[1] });
    nums.sort(function (a, b) {return a - b;});
    return nums;
}

function logStatus(serverNode, client0Node, client1Node) {
    console.log(`SERVER:`);
    console.log(`${JSON.stringify(serverNode.state)}`);
    // console.log(`  ${JSON.stringify(serverNode.commPipes[0].fromNode.name)} bitfield for ${JSON.stringify(serverNode.commPipes[0].toNode.name)}: ${JSON.stringify(serverNode.commPipes[0].from.logSeqBitfield(serverNode.commPipes[0].from.inboxBitfield, serverNode.commPipes[0].from.remoteSeqNum))}`);
    // console.log(`  ${JSON.stringify(serverNode.commPipes[0].fromNode.name)} outbox to ${JSON.stringify(serverNode.commPipes[0].toNode.name)}: ${JSON.stringify(filterForSeqNums(serverNode.commPipes[0].from.outbox))}`);
    // console.log(`  ${JSON.stringify(serverNode.commPipes[0].fromNode.name)} Houtbox to ${JSON.stringify(serverNode.commPipes[0].toNode.name)}: ${JSON.stringify(filterForSeqNums(serverNode.commPipes[0].from.historicalOutbox))}`);
    // console.log(`  ${JSON.stringify(serverNode.commPipes[0].fromNode.name)} inbox from ${JSON.stringify(serverNode.commPipes[0].toNode.name)}: ${JSON.stringify(filterForSeqNums(serverNode.commPipes[0].from.inbox))}`);

    // console.log(`  ${JSON.stringify(serverNode.commPipes[1].fromNode.name)} outbox to ${JSON.stringify(serverNode.commPipes[1].toNode.name)}: ${JSON.stringify(filterForSeqNums(serverNode.commPipes[1].from.outbox))}`);
    // console.log(`  ${JSON.stringify(serverNode.commPipes[1].fromNode.name)} Houtbox to ${JSON.stringify(serverNode.commPipes[1].toNode.name)}: ${JSON.stringify(filterForSeqNums(serverNode.commPipes[1].from.historicalOutbox))}`);
    // console.log(`  ${JSON.stringify(serverNode.commPipes[1].fromNode.name)} inbox from ${JSON.stringify(serverNode.commPipes[1].toNode.name)}: ${JSON.stringify(filterForSeqNums(serverNode.commPipes[1].from.inbox))}`);

    console.log(`C0:`);
    console.log(`${JSON.stringify(client0Node.state)}`);
    // console.log(`  ${JSON.stringify(client0Node.commPipes[0].fromNode.name)} bitfield for ${JSON.stringify(client0Node.commPipes[0].toNode.name)}: ${JSON.stringify(client0Node.commPipes[0].from.logSeqBitfield(client0Node.commPipes[0].from.inboxBitfield, client0Node.commPipes[0].from.remoteSeqNum))}`);
    // console.log(`  ${JSON.stringify(client0Node.commPipes[0].fromNode.name)} outbox to ${JSON.stringify(client0Node.commPipes[0].toNode.name)}: ${JSON.stringify(filterForSeqNums(client0Node.commPipes[0].from.outbox))}`);
    // console.log(`  ${JSON.stringify(client0Node.commPipes[0].fromNode.name)} Houtbox to ${JSON.stringify(client0Node.commPipes[0].toNode.name)}: ${JSON.stringify(filterForSeqNums(client0Node.commPipes[0].from.historicalOutbox))}`);
    // console.log(`  ${JSON.stringify(client0Node.commPipes[0].fromNode.name)} inbox from ${JSON.stringify(client0Node.commPipes[0].toNode.name)}: ${JSON.stringify(filterForSeqNums(client0Node.commPipes[0].from.inbox))}`);

    console.log(`C1:`);
    console.log(`${JSON.stringify(client1Node.state)}`);
    
    // console.log(`  ${JSON.stringify(client1Node.commPipes[0].fromNode.name)} outbox to ${JSON.stringify(client1Node.commPipes[0].toNode.name)}: ${JSON.stringify(filterForSeqNums(client1Node.commPipes[0].from.outbox))}`);
    // console.log(`  ${JSON.stringify(client1Node.commPipes[0].fromNode.name)} Houtbox to ${JSON.stringify(client1Node.commPipes[0].toNode.name)}: ${JSON.stringify(filterForSeqNums(client1Node.commPipes[0].from.historicalOutbox))}`);
    // console.log(`  ${JSON.stringify(client1Node.commPipes[0].fromNode.name)} inbox from ${JSON.stringify(client1Node.commPipes[0].toNode.name)}: ${JSON.stringify(filterForSeqNums(client1Node.commPipes[0].from.inbox))}`);

    let div0 = divergence(serverNode.state, client0Node.state);
    let div1 = divergence(serverNode.state, client1Node.state);
    if (div0+div1 > 0) {
        console.log(`Divergence: ${div0} ${div1}`)
        console.log(`  ${JSON.stringify(serverNode.commPipes[0].fromNode.name)} outbox to ${JSON.stringify(serverNode.commPipes[0].toNode.name)}: ${JSON.stringify(filterForSeqNums(serverNode.commPipes[0].from.outbox))}`);
        console.log(`  ${JSON.stringify(serverNode.commPipes[1].fromNode.name)} outbox to ${JSON.stringify(serverNode.commPipes[1].toNode.name)}: ${JSON.stringify(filterForSeqNums(serverNode.commPipes[1].from.outbox))}`);
        console.log("APPLIED:");
        console.log(`${JSON.stringify(serverNode.appliedPackets)}`);
        console.log(`${JSON.stringify(client0Node.appliedPackets)}`);
        console.log(`${JSON.stringify(client1Node.appliedPackets)}`);

    }
}

function recordDivergence (recordA, recordB) {
    let div = 0;
    for (let p in recordA) {
        if (recordA.hasOwnProperty(p)) {
            if (!recordB.hasOwnProperty(p)) {
                div++;
            } else if (recordA[p][VAL_INDEX] !== recordB[p][VAL_INDEX]) {
                div ++;
            }
        }
    }
    for (let p in recordB) {
        if (recordB.hasOwnProperty(p)) {
            if (!recordA.hasOwnProperty(p)) {
                div++;
            }
            // NOTE(JULIAN): top level equivalence already covered
        }
    }
    return div;
}

function divergence (stateA, stateB) {
    let div = 0;
    for (let p in stateA) {
        if (stateA.hasOwnProperty(p)) {
            if (!stateB.hasOwnProperty(p)) {
                div++;
            } else {
                div += recordDivergence(stateA[p],stateB[p]);
            }
        }
    }
    for (let p in stateB) {
        if (stateB.hasOwnProperty(p)) {
            if (!stateA.hasOwnProperty(p)) {
                div++;
            }
            // NOTE(JULIAN): top level equivalence already covered
        }
    }
    return div;
}

function simulateIntermittentTransmission (lossProbability) {
    return Math.random() > lossProbability;
}

function simulateNetwork () {
    let serverNode = makeNode('Server');
    let client0Node = makeNode('Client0');
    let client1Node = makeNode('Client1');
    connect(serverNode, client0Node);
    connect(serverNode, client1Node);

    // console.assert(serverNode.commPipes[0].from.outbox === client0Node.commPipes[0].to.outbox, 'WTF0');
    // console.assert(serverNode.commPipes[1].from.outbox === client1Node.commPipes[0].to.outbox, 'WTF1');
    // console.assert(serverNode.commPipes[0].from.inbox === client0Node.commPipes[0].to.inbox, 'WTF2');
    // console.assert(serverNode.commPipes[1].from.inbox === client1Node.commPipes[0].to.inbox, 'WTF3');

    let frame = 0;

    const LOSS_PROBABILITY = .5;
    let sendFrames = 20;

    for (let i = 0; i < 100; i++) {
        console.log(`--------Frame ${frame}--------`);
        
        logStatus(serverNode, client0Node, client1Node);

        // Send
        // Try increasing the amount of packets here:
        if (sendFrames > 0) {
            // for (let r = 5;/*getRandomInt(0,20);*/ r >= 0; r--) {
            for (let r = getRandomInt(0,10); r >= 0; r--) {
                let nextTransitionPayload = generateRandomStateTransition(serverNode.state);
                applyStateMutation(serverNode.state, true, 0, EProtocolType.STATE_MUTATE, nextTransitionPayload);
                serverNode.appliedPackets.push(nextTransitionPayload);
                for (let pipe of serverNode.commPipes) {
                    pipe.from.preparePacket(EProtocolType.STATE_MUTATE, nextTransitionPayload);
                    // pipe.from.preparePacket(EProtocolType.HEARTBEAT, []);
                }
            }
            sendFrames--;
        } else {
            for (let pipe of serverNode.commPipes) {
                pipe.from.preparePacket(EProtocolType.HEARTBEAT, []);
            }
        }

        for (let pipe of client0Node.commPipes) {
            pipe.from.preparePacket(EProtocolType.HEARTBEAT, []);
        }
        for (let pipe of client1Node.commPipes) {
            pipe.from.preparePacket(EProtocolType.HEARTBEAT, []);
        }

        // console.log(">>");
        // logStatus(serverNode, client0Node, client1Node);

        // Receive:
        // console.log('A:');
        for (let pipe of serverNode.commPipes) {
            // console.log(`OUTLEN: ${pipe.from.outbox.length}`);
            for (let packeti = pipe.from.outbox.length - 1; packeti >= 0; packeti--) {
                let packet = pipe.from.outbox[packeti];
                if (simulateIntermittentTransmission(LOSS_PROBABILITY)) {
                    // console.log(`Transfer from ${pipe.fromNode.name} to ${pipe.toNode.name}`)
                    let [seqNum, protocolType, data] = pipe.to.receivePacket(packet);
                    applyStateMutation(pipe.toNode.state, false, seqNum, protocolType, data);
                    pipe.toNode.appliedPackets.push(packet);
                } else {
                    // console.log(`Failed to transfer ${packet[1]} to ${pipe.fromNode.name}`)
                }
            }
        }

        // console.log('B:');
        for (let pipe of client0Node.commPipes) {
            // console.log(`OUTLEN: ${pipe.from.outbox.length}`);
            for (let packeti = pipe.from.outbox.length - 1; packeti >= 0; packeti--) {
                let packet = pipe.from.outbox[packeti];
                if (simulateIntermittentTransmission(LOSS_PROBABILITY)) {
                    // console.log(`Transfer from ${pipe.fromNode.name} to ${pipe.toNode.name}`)
                    let [seqNum, protocolType, data] = pipe.to.receivePacket(packet);
                    applyStateMutation(pipe.toNode.state, false, seqNum, protocolType, data);
                    pipe.toNode.appliedPackets.push(packet);
                } else {
                    // console.log(`Failed to transfer ${packet[1]} to ${pipe.fromNode.name}`)
                }
            }
        }
        // console.log('C:');
        for (let pipe of client1Node.commPipes) {
            // console.log(`OUTLEN: ${pipe.from.outbox.length}`);
            for (let packeti = pipe.from.outbox.length - 1; packeti >= 0; packeti--) {
                let packet = pipe.from.outbox[packeti];
                if (simulateIntermittentTransmission(LOSS_PROBABILITY)) {
                    // console.log(`Transfer from ${pipe.fromNode.name} to ${pipe.toNode.name}`)
                    let [seqNum, protocolType, data] = pipe.to.receivePacket(packet);
                    applyStateMutation(pipe.toNode.state, false, seqNum, protocolType, data);
                    pipe.toNode.appliedPackets.push(packet);
                } else {
                    // console.log(`Failed to transfer ${packet[1]} to ${pipe.fromNode.name}`)
                }
            }
        }

        frame++;
    }

        console.log("DONE!");
        console.log(`  ${JSON.stringify(serverNode.commPipes[0].fromNode.name)} outbox to ${JSON.stringify(serverNode.commPipes[0].toNode.name)}: ${JSON.stringify(filterForSeqNums(serverNode.commPipes[0].from.outbox))}`);
        console.log(`  ${JSON.stringify(serverNode.commPipes[0].from.outbox)}`);
        console.log(`  ${JSON.stringify(serverNode.commPipes[1].fromNode.name)} outbox to ${JSON.stringify(serverNode.commPipes[1].toNode.name)}: ${JSON.stringify(filterForSeqNums(serverNode.commPipes[1].from.outbox))}`);  
        console.log(`  ${JSON.stringify(serverNode.commPipes[1].from.outbox)}`);
}

simulateNetwork();

// let emptyPayload = new Map<EPropertyType,any>();
// for (let i = 1; i < PROPERTY_TYPE_LEN; i++) {
//     emptyPayload.set(i,0);
// }

// let testState = {};
// // let testMutations = [["CREATE",0,emptyPayload],["UPDATE",0,1,6],["UPDATE",0,1,7],["UPDATE",0,1,9],["UPDATE",0,1,7],["UPDATE",0,1,8],["DELETE",0],["CREATE",0,emptyPayload],["CREATE",0,emptyPayload],["CREATE",0,emptyPayload],["CREATE",0,emptyPayload],["CREATE",0,emptyPayload],["CREATE",0,emptyPayload],["CREATE",0,emptyPayload]];
// // let testPackets: any[] = [[0,14,1,1,["CREATE",0,emptyPayload]],[0,7,0,0,["DELETE",0]],[0,5,0,0,["UPDATE",0,1,7]],[0,4,0,0,["UPDATE",0,1,9]],[0,1,0,0,["CREATE",0,emptyPayload]]];
// // let testPackets: any[] = [[0,4,0,0,["UPDATE",0,1,9]],[0,2,0,0,["UPDATE",0,1,6]],[0,1,0,0,["CREATE",0,emptyPayload]],[0,14,0,0,["CREATE",0,emptyPayload]],[0,13,0,0,["CREATE",0,emptyPayload]],[0,11,0,0,["CREATE",0,emptyPayload]],[0,8,0,0,["CREATE",0,emptyPayload]],[0,7,0,0,["DELETE",0]],[0,5,0,0,["UPDATE",0,1,7]],[0,4,0,0,["UPDATE",0,1,9]],[0,3,0,0,["UPDATE",0,1,7]]];
// let testPackets: any[] = [[0,3,0,0,["CREATE",4,emptyPayload]],[0,2,0,0,["UPDATE",1,5,6]],[0,1,0,0,["CREATE",1,emptyPayload]],[0,14,0,0,["UPDATE",0,1,0]],[0,12,0,0,["CREATE",2,emptyPayload]],[0,11,0,0,["UPDATE",4,4,7]],[0,10,0,0,["UPDATE",0,4,8]],[0,8,0,0,["UPDATE",4,2,6]],[0,7,0,0,["UPDATE",4,2,1]],[0,6,0,0,["UPDATE",4,1,2]],[0,3,0,0,["CREATE",4,emptyPayload]],[0,17,0,0,["UPDATE",2,4,1]],[0,14,0,0,["UPDATE",0,1,0]],[0,13,0,0,["UPDATE",0,2,6]],[0,6,0,0,["UPDATE",4,1,2]],[0,5,0,0,["UPDATE",0,5,6]],[0,4,0,0,["CREATE",0,emptyPayload]],[0,1,0,0,["CREATE",1,emptyPayload]],[0,22,2,2,["UPDATE",3,5,5]],[0,21,2,2,["UPDATE",3,2,6]],[0,18,2,2,["CREATE",1,emptyPayload]],[0,17,0,0,["UPDATE",2,4,1]],[0,15,0,0,["UPDATE",4,3,4]],[0,12,0,0,["CREATE",2,emptyPayload]],[0,11,0,0,["UPDATE",4,4,7]],[0,10,0,0,["UPDATE",0,4,8]],[0,9,0,0,["CREATE",3,emptyPayload]],[0,8,0,0,["UPDATE",4,2,6]],[0,4,0,0,["CREATE",0,emptyPayload]],[0,35,3,7,["UPDATE",1,5,3]],[0,33,3,7,["UPDATE",0,4,3]],[0,32,3,7,["UPDATE",0,1,3]],[0,31,3,7,["UPDATE",2,5,5]],[0,29,3,7,["UPDATE",3,2,1]],[0,27,3,7,["UPDATE",2,2,3]],[0,24,2,2,["UPDATE",0,5,0]],[0,23,2,2,["UPDATE",0,3,7]],[0,21,2,2,["UPDATE",3,2,6]],[0,15,0,0,["UPDATE",4,3,4]],[0,13,0,0,["UPDATE",0,2,6]],[0,5,0,0,["UPDATE",0,5,6]],[0,4,0,0,["CREATE",0,emptyPayload]],[0,40,5,31,["UPDATE",1,2,2]],[0,36,3,7,["UPDATE",2,2,1]],[0,35,3,7,["UPDATE",1,5,3]],[0,34,3,7,["UPDATE",4,4,6]],[0,33,3,7,["UPDATE",0,4,3]],[0,31,3,7,["UPDATE",2,5,5]],[0,30,3,7,["UPDATE",1,1,2]],[0,29,3,7,["UPDATE",3,2,1]],[0,23,2,2,["UPDATE",0,3,7]],[0,49,6,63,["UPDATE",2,4,9]],[0,45,6,63,["UPDATE",3,5,2]],[0,44,6,63,["UPDATE",1,1,9]],[0,40,5,31,["UPDATE",1,2,2]],[0,37,5,31,["UPDATE",0,5,1]],[0,30,3,7,["UPDATE",1,1,2]],[0,28,3,7,["UPDATE",4,2,3]],[0,26,2,2,["UPDATE",3,2,9]],[0,19,2,2,["UPDATE",3,3,9]],[0,16,0,0,["DELETE",1]],[0,59,7,127,["UPDATE",1,1,6]],[0,58,7,127,["UPDATE",0,5,2]],[0,57,7,127,["DELETE",4]],[0,55,7,127,["UPDATE",1,5,9]],[0,53,7,127,["UPDATE",1,1,7]],[0,52,7,127,["UPDATE",0,5,9]],[0,51,7,127,["UPDATE",2,5,7]],[0,49,6,63,["UPDATE",2,4,9]],[0,48,6,63,["UPDATE",0,4,6]],[0,46,6,63,["UPDATE",4,5,4]],[0,45,6,63,["UPDATE",3,5,2]],[0,44,6,63,["UPDATE",1,1,9]],[0,43,6,63,["UPDATE",1,1,4]],[0,42,6,63,["UPDATE",1,2,8]],[0,41,6,63,["UPDATE",4,1,1]],[0,39,5,31,["UPDATE",3,1,2]],[0,38,5,31,["UPDATE",0,4,3]],[0,37,5,31,["UPDATE",0,5,1]],[0,26,2,2,["UPDATE",3,2,9]],[0,61,7,127,["UPDATE",1,1,0]],[0,60,7,127,["UPDATE",3,3,9]],[0,59,7,127,["UPDATE",1,1,6]],[0,56,7,127,["UPDATE",3,4,5]],[0,54,7,127,["UPDATE",2,4,2]],[0,53,7,127,["UPDATE",1,1,7]],[0,52,7,127,["UPDATE",0,5,9]],[0,48,6,63,["UPDATE",0,4,6]],[0,47,6,63,["UPDATE",0,3,6]],[0,42,6,63,["UPDATE",1,2,8]],[0,39,5,31,["UPDATE",3,1,2]],[0,38,5,31,["UPDATE",0,4,3]],[0,37,5,31,["UPDATE",0,5,1]],[0,26,2,2,["UPDATE",3,2,9]],[0,25,2,2,["UPDATE",0,5,7]],[0,20,2,2,["UPDATE",1,1,1]],[0,19,2,2,["UPDATE",3,3,9]],[0,16,0,0,["DELETE",1]],[0,71,9,510,["UPDATE",0,5,4]],[0,70,9,510,["UPDATE",0,5,3]],[0,69,9,510,["UPDATE",4,1,0]],[0,68,9,510,["UPDATE",2,4,2]],[0,67,9,510,["UPDATE",4,4,4]],[0,66,9,510,["UPDATE",0,1,8]],[0,65,9,510,["UPDATE",4,1,8]],[0,64,9,510,["CREATE",4,emptyPayload]],[0,63,7,127,["UPDATE",2,4,6]],[0,60,7,127,["UPDATE",3,3,9]],[0,54,7,127,["UPDATE",2,4,2]],[0,50,7,127,["UPDATE",0,4,8]],[0,25,2,2,["UPDATE",0,5,7]],[0,19,2,2,["UPDATE",3,3,9]],[0,16,0,0,["DELETE",1]],[0,82,10,1023,["UPDATE",1,1,9]],[0,81,10,1023,["UPDATE",4,1,5]],[0,80,10,1023,["UPDATE",4,5,2]],[0,78,10,1023,["UPDATE",2,1,6]],[0,75,10,1023,["UPDATE",4,2,3]],[0,72,9,510,["UPDATE",3,3,4]],[0,66,9,510,["UPDATE",0,1,8]],[0,65,9,510,["UPDATE",4,1,8]],[0,64,9,510,["CREATE",4,emptyPayload]],[0,62,7,127,["UPDATE",2,1,7]],[0,25,2,2,["UPDATE",0,5,7]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[0,88,10,1023,["UPDATE",4,4,3]],[0,86,10,1023,["UPDATE",4,3,8]],[0,84,10,1023,["UPDATE",2,1,8]],[0,79,10,1023,["UPDATE",1,1,9]],[0,77,10,1023,["UPDATE",4,3,0]],[0,76,10,1023,["UPDATE",2,3,4]],[0,74,10,1023,["UPDATE",1,1,5]],[0,72,9,510,["UPDATE",3,3,4]],[0,68,9,510,["UPDATE",2,4,2]],[0,67,9,510,["UPDATE",4,4,4]],[0,66,9,510,["UPDATE",0,1,8]],[0,65,9,510,["UPDATE",4,1,8]],[0,63,7,127,["UPDATE",2,4,6]],[0,50,7,127,["UPDATE",0,4,8]],[0,89,11,2047,["UPDATE",3,3,7]],[0,88,10,1023,["UPDATE",4,4,3]],[0,87,10,1023,["UPDATE",1,5,2]],[0,86,10,1023,["UPDATE",4,3,8]],[0,85,10,1023,["UPDATE",3,4,8]],[0,84,10,1023,["UPDATE",2,1,8]],[0,83,10,1023,["UPDATE",1,4,1]],[0,80,10,1023,["UPDATE",4,5,2]],[0,79,10,1023,["UPDATE",1,1,9]],[0,75,10,1023,["UPDATE",4,2,3]],[0,73,9,510,["UPDATE",1,1,3]],[0,62,7,127,["UPDATE",2,1,7]],[0,20,2,2,["UPDATE",1,1,1]],[0,95,12,4095,["UPDATE",2,5,1]],[0,91,11,2047,["UPDATE",1,1,4]],[0,90,11,2047,["UPDATE",2,2,6]],[0,87,10,1023,["UPDATE",1,5,2]],[0,84,10,1023,["UPDATE",2,1,8]],[0,83,10,1023,["UPDATE",1,4,1]],[0,79,10,1023,["UPDATE",1,1,9]],[0,76,10,1023,["UPDATE",2,3,4]],[0,74,10,1023,["UPDATE",1,1,5]],[0,104,12,4095,["UPDATE",3,3,5]],[0,102,12,4095,["UPDATE",2,1,9]],[0,101,12,4095,["UPDATE",2,1,7]],[0,99,12,4095,["UPDATE",4,1,7]],[0,98,12,4095,["UPDATE",2,1,0]],[0,97,12,4095,["UPDATE",4,3,5]],[0,95,12,4095,["UPDATE",2,5,1]],[0,93,12,4095,["UPDATE",3,5,5]],[0,92,12,4095,["UPDATE",3,3,1]],[0,91,11,2047,["UPDATE",1,1,4]],[0,90,11,2047,["UPDATE",2,2,6]],[0,89,11,2047,["UPDATE",3,3,7]],[0,88,10,1023,["UPDATE",4,4,3]],[0,87,10,1023,["UPDATE",1,5,2]],[0,86,10,1023,["UPDATE",4,3,8]],[0,85,10,1023,["UPDATE",3,4,8]],[0,83,10,1023,["UPDATE",1,4,1]],[0,77,10,1023,["UPDATE",4,3,0]],[0,76,10,1023,["UPDATE",2,3,4]],[0,108,15,32765,["UPDATE",1,3,2]],[0,107,15,32765,["UPDATE",3,2,7]],[0,106,15,32765,["UPDATE",1,3,0]],[0,104,12,4095,["UPDATE",3,3,5]],[0,102,12,4095,["UPDATE",2,1,9]],[0,100,12,4095,["UPDATE",1,3,9]],[0,98,12,4095,["UPDATE",2,1,0]],[0,93,12,4095,["UPDATE",3,5,5]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[0,120,16,65535,["UPDATE",2,1,0]],[0,119,16,65535,["UPDATE",2,4,8]],[0,118,16,65535,["UPDATE",4,1,9]],[0,116,16,65535,["UPDATE",4,4,7]],[0,115,16,65535,["UPDATE",4,4,5]],[0,113,16,65535,["UPDATE",2,3,3]],[0,112,16,65535,["UPDATE",2,5,2]],[0,111,16,65535,["UPDATE",4,5,0]],[0,110,15,32765,["UPDATE",0,4,4]],[0,109,15,32765,["UPDATE",3,5,9]],[0,106,15,32765,["UPDATE",1,3,0]],[0,100,12,4095,["UPDATE",1,3,9]],[0,94,12,4095,["UPDATE",2,4,8]],[0,25,2,2,["UPDATE",0,5,7]],[0,20,2,2,["UPDATE",1,1,1]],[0,119,16,65535,["UPDATE",2,4,8]],[0,118,16,65535,["UPDATE",4,1,9]],[0,115,16,65535,["UPDATE",4,4,5]],[0,114,16,65535,["UPDATE",4,5,4]],[0,110,15,32765,["UPDATE",0,4,4]],[0,108,15,32765,["UPDATE",1,3,2]],[0,105,15,32765,["UPDATE",1,2,3]],[0,103,12,4095,["UPDATE",4,4,8]],[0,100,12,4095,["UPDATE",1,3,9]],[0,96,12,4095,["UPDATE",0,2,9]],[0,94,12,4095,["UPDATE",2,4,8]],[0,16,0,0,["DELETE",1]],[0,128,16,65535,["UPDATE",0,2,2]],[0,127,16,65535,["UPDATE",2,2,9]],[0,125,16,65535,["UPDATE",4,1,4]],[0,123,16,65535,["UPDATE",4,2,3]],[0,122,16,65535,["UPDATE",0,1,8]],[0,121,16,65535,["UPDATE",0,1,8]],[0,119,16,65535,["UPDATE",2,4,8]],[0,118,16,65535,["UPDATE",4,1,9]],[0,115,16,65535,["UPDATE",4,4,5]],[0,114,16,65535,["UPDATE",4,5,4]],[0,113,16,65535,["UPDATE",2,3,3]],[0,112,16,65535,["UPDATE",2,5,2]],[0,108,15,32765,["UPDATE",1,3,2]],[0,107,15,32765,["UPDATE",3,2,7]],[0,106,15,32765,["UPDATE",1,3,0]],[0,105,15,32765,["UPDATE",1,2,3]],[0,103,12,4095,["UPDATE",4,4,8]],[0,100,12,4095,["UPDATE",1,3,9]],[0,25,2,2,["UPDATE",0,5,7]],[0,123,16,65535,["UPDATE",4,2,3]],[0,121,16,65535,["UPDATE",0,1,8]],[0,25,2,2,["UPDATE",0,5,7]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[0,128,16,65535,["UPDATE",0,2,2]],[0,124,16,65535,["UPDATE",3,4,2]],[0,121,16,65535,["UPDATE",0,1,8]],[0,20,2,2,["UPDATE",1,1,1]],[1,132,19,524287,[]],[0,130,19,524287,["UPDATE",2,2,6]],[0,128,16,65535,["UPDATE",0,2,2]],[0,123,16,65535,["UPDATE",4,2,3]],[0,121,16,65535,["UPDATE",0,1,8]],[0,117,16,65535,["UPDATE",0,3,5]],[1,133,22,4194301,[]],[0,130,19,524287,["UPDATE",2,2,6]],[0,129,19,524287,["UPDATE",1,2,9]],[0,126,16,65535,["UPDATE",3,1,4]],[0,117,16,65535,["UPDATE",0,3,5]],[0,25,2,2,["UPDATE",0,5,7]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[1,131,19,524287,[]],[0,129,19,524287,["UPDATE",1,2,9]],[0,126,16,65535,["UPDATE",3,1,4]],[0,25,2,2,["UPDATE",0,5,7]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[1,136,24,16777215,[]],[1,135,24,16777215,[]],[1,134,23,8388607,[]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[1,137,26,67108863,[]],[1,135,24,16777215,[]],[1,134,23,8388607,[]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[1,138,27,134217727,[]],[1,139,27,134217727,[]],[0,25,2,2,["UPDATE",0,5,7]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[0,25,2,2,["UPDATE",0,5,7]],[0,16,0,0,["DELETE",1]],[1,143,31,2147483647,[]],[1,142,30,1073741823,[]],[1,144,31,2147483647,[]],[1,142,30,1073741823,[]],[1,140,28,268435455,[]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[1,145,33,-1,[]],[1,144,31,2147483647,[]],[1,140,28,268435455,[]],[0,25,2,2,["UPDATE",0,5,7]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[1,146,34,-1,[]],[0,20,2,2,["UPDATE",1,1,1]],[1,146,34,-1,[]],[0,16,0,0,["DELETE",1]],[1,148,37,-1,[]],[1,147,36,-1,[]],[1,141,29,536870911,[]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[1,147,36,-1,[]],[0,25,2,2,["UPDATE",0,5,7]],[0,20,2,2,["UPDATE",1,1,1]],[0,25,2,2,["UPDATE",0,5,7]],[1,150,39,-2,[]],[1,149,37,-1,[]],[0,25,2,2,["UPDATE",0,5,7]],[0,16,0,0,["DELETE",1]],[1,151,39,-1,[]],[0,25,2,2,["UPDATE",0,5,7]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[1,153,42,-1,[]],[1,152,41,-1,[]],[1,151,39,-1,[]],[0,25,2,2,["UPDATE",0,5,7]],[1,154,42,-1,[]],[1,153,42,-1,[]],[1,151,39,-1,[]],[0,20,2,2,["UPDATE",1,1,1]],[1,155,42,-1,[]],[1,152,41,-1,[]],[1,151,39,-1,[]],[0,16,0,0,["DELETE",1]],[1,155,42,-1,[]],[0,25,2,2,["UPDATE",0,5,7]],[0,20,2,2,["UPDATE",1,1,1]],[1,157,44,-2,[]],[1,156,44,-2,[]],[1,155,42,-1,[]],[1,154,42,-1,[]],[0,25,2,2,["UPDATE",0,5,7]],[0,16,0,0,["DELETE",1]],[0,25,2,2,["UPDATE",0,5,7]],[0,16,0,0,["DELETE",1]],[1,160,48,-1,[]],[1,158,44,-2,[]],[1,161,50,-1,[]],[1,160,48,-1,[]],[0,25,2,2,["UPDATE",0,5,7]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[1,162,50,-1,[]],[1,160,48,-1,[]],[1,159,47,-9,[]],[0,25,2,2,["UPDATE",0,5,7]],[0,16,0,0,["DELETE",1]],[1,162,50,-1,[]],[0,20,2,2,["UPDATE",1,1,1]],[1,164,52,-1,[]],[1,163,52,-2,[]],[1,162,50,-1,[]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[0,25,2,2,["UPDATE",0,5,7]],[0,20,2,2,["UPDATE",1,1,1]],[1,165,54,-1,[]],[0,20,2,2,["UPDATE",1,1,1]],[1,166,55,-1,[]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[1,168,56,-1,[]],[1,167,55,-1,[]],[1,166,55,-1,[]],[1,165,54,-1,[]],[0,25,2,2,["UPDATE",0,5,7]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[1,167,55,-1,[]],[0,16,0,0,["DELETE",1]],[1,171,60,-1,[]],[1,170,59,-1,[]],[1,169,58,-1,[]],[0,25,2,2,["UPDATE",0,5,7]],[1,172,60,-1,[]],[1,171,60,-1,[]],[0,25,2,2,["UPDATE",0,5,7]],[0,16,0,0,["DELETE",1]],[1,173,60,-1,[]],[1,172,60,-1,[]],[1,170,59,-1,[]],[1,169,58,-1,[]],[0,25,2,2,["UPDATE",0,5,7]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[1,171,60,-1,[]],[1,170,59,-1,[]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[1,174,60,-1,[]],[1,174,60,-1,[]],[0,25,2,2,["UPDATE",0,5,7]],[0,16,0,0,["DELETE",1]],[1,177,66,-17,[]],[1,176,65,-11,[]],[1,175,64,-6,[]],[0,25,2,2,["UPDATE",0,5,7]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[1,178,66,-1,[]],[1,175,64,-6,[]],[0,25,2,2,["UPDATE",0,5,7]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[1,177,66,-17,[]],[1,175,64,-6,[]],[0,25,2,2,["UPDATE",0,5,7]],[1,180,67,-1,[]],[1,178,66,-1,[]],[1,177,66,-17,[]],[1,176,65,-11,[]],[1,175,64,-6,[]],[0,25,2,2,["UPDATE",0,5,7]],[0,16,0,0,["DELETE",1]],[1,180,67,-1,[]],[0,25,2,2,["UPDATE",0,5,7]],[1,182,71,-4,[]],[1,181,67,-1,[]],[0,25,2,2,["UPDATE",0,5,7]],[0,20,2,2,["UPDATE",1,1,1]],[1,183,71,-2,[]],[1,182,71,-4,[]],[1,181,67,-1,[]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[1,183,71,-2,[]],[0,25,2,2,["UPDATE",0,5,7]],[1,179,67,-1,[]],[0,25,2,2,["UPDATE",0,5,7]],[0,16,0,0,["DELETE",1]],[1,185,73,-2,[]],[1,184,73,-6,[]],[1,183,71,-2,[]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[1,187,76,-11,[]],[1,186,73,-2,[]],[1,185,73,-2,[]],[0,25,2,2,["UPDATE",0,5,7]],[1,186,73,-2,[]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[0,25,2,2,["UPDATE",0,5,7]],[1,190,78,-1,[]],[0,25,2,2,["UPDATE",0,5,7]],[1,190,78,-1,[]],[1,189,78,-1,[]],[1,188,77,-21,[]],[0,25,2,2,["UPDATE",0,5,7]],[0,16,0,0,["DELETE",1]],[1,191,80,-1,[]],[1,188,77,-21,[]],[0,25,2,2,["UPDATE",0,5,7]],[0,20,2,2,["UPDATE",1,1,1]],[1,194,82,-1,[]],[1,193,82,-1,[]],[1,189,78,-1,[]],[1,188,77,-21,[]],[0,25,2,2,["UPDATE",0,5,7]],[1,193,82,-1,[]],[1,195,84,-2,[]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[1,197,85,-1,[]],[0,16,0,0,["DELETE",1]],[1,197,85,-1,[]],[1,196,85,-1,[]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[1,199,87,-1,[]],[1,198,87,-1,[]],[0,25,2,2,["UPDATE",0,5,7]],[0,20,2,2,["UPDATE",1,1,1]],[1,200,88,-1,[]],[1,199,87,-1,[]],[1,198,87,-1,[]],[1,200,88,-1,[]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[1,200,88,-1,[]],[1,192,80,-1,[]],[0,25,2,2,["UPDATE",0,5,7]],[0,16,0,0,["DELETE",1]],[1,203,91,-1,[]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[1,204,93,-1,[]],[1,202,90,-1,[]],[1,201,90,-2,[]],[0,25,2,2,["UPDATE",0,5,7]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[1,205,93,-1,[]],[1,203,91,-1,[]],[0,16,0,0,["DELETE",1]],[1,204,93,-1,[]],[1,203,91,-1,[]],[1,201,90,-2,[]],[0,20,2,2,["UPDATE",1,1,1]],[0,16,0,0,["DELETE",1]],[1,206,93,-1,[]],[0,25,2,2,["UPDATE",0,5,7]],[1,207,96,-4,[]],[1,206,93,-1,[]],[0,25,2,2,["UPDATE",0,5,7]],[0,20,2,2,["UPDATE",1,1,1]],[0,20,2,2,["UPDATE",1,1,1]]]
// // for (let mutation of testMutations) {
// for (let mutation of testPackets) {
//     // console.log(`Applying ${JSON.stringify(mutation)} to ${JSON.stringify(testState)}`)
//     console.log(`Applying ${JSON.stringify(mutation)} to ${JSON.stringify(testState)}`)
//     // applyStateMutation(testState, true, 0, EProtocolType.STATE_MUTATE, mutation);
//     applyStateMutation(testState, false, mutation[1], mutation[0], mutation[4]);
//     console.log(`Now ${JSON.stringify(testState)}`)
// }


// If the message has been superseded, don't send again. Elsewise, send with new id?


// Frame it as embodied computation