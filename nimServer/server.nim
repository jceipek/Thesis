import net
import posix #for usleep
import streams
import math
import times

GC_disable()

var socket = newSocket(Domain.AF_INET, SockType.SOCK_DGRAM, Protocol.IPPROTO_UDP, true)
bindAddr(socket, Port(0), "")
setSockOpt(socket, SOBool.OptBroadcast, true, SOL_SOCKET)

var myStream : StringStream = newStringStream()

type
    MessageKind = enum
        PosRotScaleVisibleTint = 0x03
        MultiMessage = 0X08
    ModelType = enum
        MT_Cube = 0X11
    # NetMessage = object
    #     case kind: MessageKind
    #     of MessageKind.PosRotScaleVisibleTint:
    #         seqNumber: int32
    Vector3 = tuple
        x,y,z: float32
    Quaternion = tuple[x: float32, y: float32, z: float32, w: float32]
    Color = tuple[r: uint8, g: uint8, b: uint8, a: uint8]
    Entity = object
        id: uint16
        modelType: ModelType
        pos: Vector3
        rot: Quaternion
        scale: Vector3
        visible: bool
        tint: Color
        

proc addEntity (s: Stream, entity: Entity) : int =
    s.write(ord(MessageKind.PosRotScaleVisibleTint).toU8())
    const seqNumber : int32 = 0
    s.write(seqNumber)
    s.write(entity.id)
    s.write(ord(entity.modelType).toU16())
    s.write(entity.pos)
    s.write(entity.rot)
    s.write(entity.scale)
    s.write(ord(entity.visible).toU8())
    s.write(entity.tint)
    const gizmoFlags : uint8 = 0
    s.write(gizmoFlags)
    return s.getPosition()



const ENTITY_MSG_SIZE = 55
const MAX_MSG_SIZE = 1200
var buffer = alloc(MAX_MSG_SIZE)


var entities = newSeqofCap[Entity](1000)
# for i in 0..200:
for i in 0..800:
    var num : uint16 = cast[uint16](i.toU16())
    var posX : float32 = i.toFloat() 
    entities.add(Entity(id: num,
                    modelType: ModelType.MT_Cube,
                    pos: (0.2'f32 * posX,0'f32,0'f32),
                    rot: (0'f32,0'f32,0'f32,1'f32),
                    scale: (1'f32,1'f32,1'f32),
                    visible: true,
                    tint: (0'u8,255'u8,0'u8,255'u8)))

var totalTimeForSending : float = 0
var totalTimeForCopying : float = 0

proc sendEntity(s: Socket, address: string, port: Port, stream: Stream, buffer: pointer, entity: Entity) : int =
    var startTime = cpuTime()
    
    stream.setPosition(0)
    var size = stream.addEntity(entity)
    stream.setPosition(0)
    discard stream.readData(buffer, size)

    totalTimeForCopying += (cpuTime() - startTime)

    startTime = cpuTime()
    result = s.sendTo(address, port, buffer, size)
    totalTimeForSending += (cpuTime() - startTime) 

var timer : int = 0

const FPS : float = 1/90
const FPS_MS : float = FPS * 1000

const DEST_PORT = Port(8053)
# const DEST_ADDR = "192.168.1.255"
const DEST_ADDR = "127.0.0.1"

while true:
    let startTimeSeconds = epochTime()

    for ent in entities.mitems:
        ent.pos.y = sin(timer.toFloat()*0.1)

    totalTimeForSending = 0
    totalTimeForCopying = 0

    let maxStorable : int = MAX_MSG_SIZE div ENTITY_MSG_SIZE
    let entityCount = entities.high() + 1
    for i, ent in entities:
        if i mod maxStorable == 0:
            myStream.setPosition(0)
            myStream.write(ord(MessageKind.MultiMessage).toU8())
            myStream.write(min(entityCount - i, maxStorable).toU16())
            # echo "COUNT ", min(entityCount - i, maxStorable).toU16()
        # echo "ADD ",ent.id
        discard myStream.addEntity(ent)

        if (i + 1 == entityCount) or ((i+1) mod maxStorable == 0):
            let size = myStream.getPosition()
            myStream.setPosition(0)
            discard myStream.readData(buffer, size)
            discard socket.sendTo(DEST_ADDR, DEST_PORT, buffer, size)
            # echo "SEND"


    # for ent in entities.mitems:
    #     var result = socket.sendEntity(DEST_ADDR, DEST_PORT, myStream, buffer, ent)
    #     if result == -1:
    #         var e = getSocketError(socket)
    #         echo "socket error:"
    #         echo e
    
    # echo totalTimeForSending*1000, '\t', totalTimeForCopying*1000

    GC_step(2000, true) # 2ms

    let deltaTimeMilliseconds = (epochTime() - startTimeSeconds) * 1000

    let delay = ((FPS_MS - deltaTimeMilliseconds)*1000).toInt() # In microseconds, so * 1000
    if delay > 0:
        if usleep(delay) != 0:
            echo "errno"
            echo errno
    else:
        echo ">>>>>EXCEEDED TIME BUDGET>>>>>>>>>>>>>>>>>>>>>>>>>>>>>",deltaTimeMilliseconds

    timer += 1