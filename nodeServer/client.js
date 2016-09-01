const Promise = require("bluebird");

const MESSAGE_TYPE = {
  Unknown: -1,
  Default: 0x00,
  Position: 0x01
}

const PORT = 8053;
// const HOST = '127.0.0.1';
// const HOST = '192.168.1.143';
const HOST = '255.255.255.255'; // Local broadcast (https://tools.ietf.org/html/rfc922)

const dgram = require('dgram');

const client = dgram.createSocket('udp4');
// client.setBroadcast(true);

// client.bind(PORT);
// client.bind();


const sendFn = function (message, callback) {
  client.send(message, 0, message.length, PORT, HOST, callback /* (err, bytes) */); // NOTE(Julian): Buffer can't be reused until callback has been called
};

var _currSeqId = 0;
const sendObjectPosition = function (obj, callback) {
  fillBufferWithPosMsg(_sendBuffer, 0, MESSAGE_TYPE.Position, _currSeqId, obj.id, obj.position);
  _currSeqId++;
  sendFn(_sendBuffer, callback);
};

const sendObjectPositionFn = Promise.promisify(sendObjectPosition);

const fillBufferWithPosMsg = function (buf, offset, msgType, seqNumber, objectId, position) {
  // XXX(Julian): Assuming Little Endian, but this may be a big mistake!!!
  offset = buf.writeInt8(msgType, offset, true); // Last is noAssert?
  offset = buf.writeInt32LE(seqNumber, offset, true);
  offset = buf.writeUInt16LE(objectId, offset, true);
  offset = buf.writeFloatLE(position.x, offset, true);
  offset = buf.writeFloatLE(position.y, offset, true);
  offset = buf.writeFloatLE(position.z, offset, true);
}

var _time = 0;

const _sendBuffer = Buffer.allocUnsafe(23);

const makeObjectFn = function (id) {
  return {
    position: { x: 0, y: 0, z: 0 }
  , id: id
  };
};

// const _objects = Array(300);
const _objects = Array(1);
for (var i = _objects.length - 1; i >= 0; i--) {
  _objects[i] = makeObjectFn(i);
}


const FPS = 90;
// const FPS = 60;


// var _start = process.hrtime();
// var elapsed_time = function(note){
//     var precision = 3; // 3 decimal places
//     var elapsed = process.hrtime(_start)[1] / 1000000; // divide by a million to get nano to milli
//     console.log(process.hrtime(_start)[0] + " s, " + elapsed.toFixed(precision) + " ms - " + note); // print message + time
//     _start = process.hrtime(); // reset the timer
// }


// var triangleWave = function (t, halfPeriod) {
//   return (2/halfPeriod) * (t - halfPeriod * (t/halfPeriod + 1/2)) * Math.pow(-1, (t/halfPeriod) + 1/2);
// }


var _x = 0;
var _dir = 1;
var _gridSize = 0.1;

client.bind( function() {
  client.setBroadcast(true)
  // client.setMulticastTTL(128);

  var interval = setInterval(function() {

    // var DEBUG_start = process.hrtime();

    _x += _dir*1/FPS;
    if (_x >= 1 || _x <= 0) {
      _dir = -_dir;
    }


    for (var objectId = 0; objectId < _objects.length; objectId++) {
      var pos = _objects[objectId].position;

      // pos.x = (Math.sin(_time*0.1+objectId/2*Math.cos(_time*0.1+objectId/2)))*30;//objectId * 2;
      // pos.y = Math.sin(_time*0.1+objectId/2)*30;
      // pos.z = Math.cos(_time*0.1+objectId/2)*30;

      // pos.x = 0;//objectId * 2;
      // pos.y = Math.floor((1.5+_x)/_gridSize)*_gridSize;// Math.sin(_time);
      // pos.z = 0;

      pos.x = _POS.x;
      pos.y = _POS.y;
      pos.z = _POS.z;
    }

    var DEBUG_start_sending = process.hrtime();

    Promise.each(_objects, function (x) { return sendObjectPositionFn(x); }).then(function () {
      var elapsed = process.hrtime(DEBUG_start_sending)[1] / 1000000;
      console.log(process.hrtime(DEBUG_start_sending)[0] + " s, " + elapsed.toFixed(3) + " ms ");
    });

    _time += 1/FPS;
    // if (_time > 10000) {
    //   _time = 0;
    // }
  }, 1000/FPS);
});


//client.close();

const server = client;//dgram.createSocket('udp4');

server.on('listening', function () {
    var address = server.address();
    console.log('UDP Server listening on ' + address.address + ":" + address.port);
});


var _POS = {x:0,y:0,z:0};

server.on('message', function (message, remote) {
  var data = { pos: {x: message.readFloatLE(0), y: message.readFloatLE(0+4), z: message.readFloatLE(0+4+4)}
             , rot: {x: message.readFloatLE(0+4+4+4), y: message.readFloatLE(0+4+4+4+4), z: message.readFloatLE(0+4+4+4+4+4), w: message.readFloatLE(0+4+4+4+4+4+4)}
             , grab: message.readUInt8(0+4+4+4+4+4+4+4)
             }
  _POS = data.pos;
  console.log(data);
    // console.log(remote.address + ':' + remote.port +' - ' + message);
});