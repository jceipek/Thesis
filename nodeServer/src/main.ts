import * as BPromise from 'bluebird'
import * as FS from 'fs'
import { usleep } from 'sleep'
import { vec3 as Vec3, quat as Quat } from 'gl-matrix'
import { MESSAGE_TYPE, MODEL_TYPE, CONTROLLER_ATTACHMENT_TYPE, GIZMO_VISUALS_FLAGS } from './protocol'
import * as SH from './spatialHash'
import { ISpatialHash } from './spatialHash'
import { STATE, stepSimulation, makeHeadset, makeController } from './compute'
import {
  IState
, ITransientState
, IInputData
, IHeadset
, IController
} from './interface'
import {
  NETWORK
, FPS
, X_VECTOR3
, Y_VECTOR3
, Z_VECTOR3
, UNIT_VECTOR3
, NULL_VECTOR3
, IDENT_QUAT
, BASE_COLOR
} from './constants'
import * as Transfer from './stateTransfer'
import { PERFORMANCE_TRACKER, nanosecondsFromElapsedDelta, countObjects } from './instrumentation'

let _interval : null|NodeJS.Timer = null;
const TRANSIENT_STATE : ITransientState = { inputData: new Map<string,IInputData>() };

function stepSimulationAndSend () {
  if (PERFORMANCE_TRACKER[PERFORMANCE_TRACKER.currFrame] === undefined) {
    PERFORMANCE_TRACKER[PERFORMANCE_TRACKER.currFrame] = {};
  }

  let DEBUG_start_compute = process.hrtime();

  let controllers = [];
  for (let [client, inputData] of TRANSIENT_STATE.inputData) {
    for (let controller of inputData.controllers) {
      controllers.push(controller);
    }
  }
  stepSimulation(controllers); // S_t -> S_t+1
  for (let controller of controllers) {
    if (controller.ignore) { continue; }
    controller.grab.last = controller.grab.curr; // So that we can grab things
    controller.action0.last = controller.action0.curr;
  }

  PERFORMANCE_TRACKER[PERFORMANCE_TRACKER.currFrame].objectCount = countObjects(STATE);
  PERFORMANCE_TRACKER[PERFORMANCE_TRACKER.currFrame].computeTime = nanosecondsFromElapsedDelta(process.hrtime(DEBUG_start_compute));
  
  Transfer.tryTransferState(STATE, TRANSIENT_STATE);

  // NOTE(JULIAN): This is for performance testing -- create an object every .5s
  // if (PERFORMANCE_TRACKER.currFrame % (FPS/2) === 0) {
  //   STATE.entities.entities.push(makeEntity(Vec3.fromValues(0,0.5*PERFORMANCE_TRACKER.currFrame/100,0), Quat.create(), Vec3.clone(UNIT_VECTOR3), new Uint8Array([0xFF,0x00,0x00,0xEE]), MODEL_TYPE.CUBE));
  // }

  STATE.globalTime += 1/FPS;
  PERFORMANCE_TRACKER.currFrame++;
}

NETWORK.bind(8054, undefined, () => {
  NETWORK.setBroadcast(true);
  _interval = setInterval(stepSimulationAndSend, 1000/FPS);
});

NETWORK.on('listening', () => {
    let address = NETWORK.address();
    console.log('UDP Server listening on ' + address.address + ":" + address.port);
});

// Grab and store controller data
NETWORK.on('message', (message : Buffer, remote) => {
  let client = remote.address + ':' + remote.port;
  let inputData = TRANSIENT_STATE.inputData;
  if (!inputData.has(client)) {
    console.log(`${client} connected!`);
    inputData.set(client, { headset: makeHeadset()
                          , controllers: [ makeController(CONTROLLER_ATTACHMENT_TYPE.DELETE)
                                         , makeController(CONTROLLER_ATTACHMENT_TYPE.GRAB) ]});
  }

  decodeAvatarMessage(message, 0, /*out*/inputData.get(client).headset, /*out*/inputData.get(client).controllers[0], /*out*/inputData.get(client).controllers[1]);
});

function decodeAvatarMessage(message: Buffer, offset: number, outHeadset : IHeadset, outControllerLeft : IController, outControllerRight : IController) {
  Vec3.set(/*out*/outHeadset.pos
          , message.readFloatLE(offset, true)
          , message.readFloatLE(offset+=4, true)
          , message.readFloatLE(offset+=4, true));
  Quat.set(/*out*/outHeadset.rot
          , message.readFloatLE(offset+=4, true) // w
          , message.readFloatLE(offset+=4, true)
          , message.readFloatLE(offset+=4, true)
          , message.readFloatLE(offset+=4, true));

  Vec3.set(/*out*/outControllerLeft.pos
          , message.readFloatLE(offset+=4, true)
          , message.readFloatLE(offset+=4, true)
          , message.readFloatLE(offset+=4, true));
  Quat.set(/*out*/outControllerLeft.rot
          , message.readFloatLE(offset+=4, true) // w
          , message.readFloatLE(offset+=4, true)
          , message.readFloatLE(offset+=4, true)
          , message.readFloatLE(offset+=4, true));
  outControllerLeft.grab.curr = <0|1>message.readUInt8(offset+=4, true);
  outControllerLeft.action0.curr = <0|1>message.readUInt8(offset+=1, true);

  Vec3.set(/*out*/outControllerRight.pos
          , message.readFloatLE(offset+=1, true)
          , message.readFloatLE(offset+=4, true)
          , message.readFloatLE(offset+=4, true));
  Quat.set(/*out*/outControllerRight.rot
          , message.readFloatLE(offset+=4, true) // w
          , message.readFloatLE(offset+=4, true)
          , message.readFloatLE(offset+=4, true)
          , message.readFloatLE(offset+=4, true));
  outControllerRight.grab.curr = <0|1>message.readUInt8(offset+=4, true);
  outControllerRight.action0.curr = <0|1>message.readUInt8(offset+=1, true);
}

process.on('SIGINT', () => {
  clearInterval(_interval);

  for (let i = 0; i < PERFORMANCE_TRACKER.currFrame; i++) {
    console.log(`${PERFORMANCE_TRACKER[i].computeTime}\t${PERFORMANCE_TRACKER[i].transferTime}\t${PERFORMANCE_TRACKER[i].preTransferTime}\t${PERFORMANCE_TRACKER[i].objectCount}`);
  }

  // FS.writeFile(`persistentState${(new Date()).getTime()}.json`, serializeState({_latestEntityId: _latestEntityId, STATE: STATE}), function(err) {
  //   if(err) {
  //       return console.log(err);
  //   }

  //   console.log("Saved State to JSON");
  //   setTimeout(() => {
  //     process.exit();
  //   }, 1000);
  // });

  process.exit();
  console.log("NOT SAVING TO JSON!");
});