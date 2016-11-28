import net
import posix #for usleep
import streams

var socket = newSocket(Domain.AF_INET, SockType.SOCK_DGRAM, Protocol.IPPROTO_UDP, true)
bindAddr(socket, Port(0), "")

var myStream : StringStream = newStringStream()

#55
type
    MessageKind = enum
        PosRotScaleVisibleTint = 0x03
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

# var testEntity : Entity =
#     Entity(id: 0,
#            modelType: ModelType.MT_Cube,
#            pos: (0'f32,0'f32,0'f32),
#            rot: (0'f32,0'f32,0'f32,1'f32),
#            scale: (1'f32,1'f32,1'f32),
#            visible: true,
#            tint: (0'u8,255'u8,0'u8,255'u8))

const MAX_MSG_SIZE = 55
var buffer = alloc(MAX_MSG_SIZE)

var entities = newSeqofCap[Entity](2)
entities.add(Entity(id: 0,
                   modelType: ModelType.MT_Cube,
                   pos: (0'f32,0'f32,0'f32),
                   rot: (0'f32,0'f32,0'f32,1'f32),
                   scale: (1'f32,1'f32,1'f32),
                   visible: true,
                   tint: (0'u8,255'u8,0'u8,255'u8)))
entities.add(Entity(id: 1,
                   modelType: ModelType.MT_Cube,
                   pos: (1'f32,0'f32,0'f32),
                   rot: (0'f32,0'f32,0'f32,1'f32),
                   scale: (1'f32,1'f32,1'f32),
                   visible: true,
                   tint: (0'u8,255'u8,0'u8,255'u8)))

proc sendEntity(s: Socket, address: string, port: Port, stream: Stream, buffer: pointer, entity: Entity) : int =
    stream.setPosition(0)
    var size = stream.addEntity(entity)
    stream.setPosition(0)
    discard stream.readData(buffer, size)
    return s.sendTo(address, port, buffer, size)

while true:
    for ent in entities:
        var result = socket.sendEntity("127.0.0.1", Port(8053), myStream, buffer, ent)
        if result == -1:
            var e = getSocketError(socket)
            echo "socket error:"
            echo e
    
    if usleep(1000*1000) != 0: # 1000ms
        echo "errno"
        echo errno
    else:
        echo "Slept"
    # socket: Socket; address: string; port: Port; data: pointer; size: int;
    # var result = socket.sendTo("127.0.0.1", Port(8054), "\x00\x00\x00\x00\xf6\x28\xbc\x3f\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x80\x3f\x33\x33\x33\xbe\x1f\x85\x6b\x3f\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x80\x3f\x00\x00\xd1\x22\xab\x3f\x1f\x85\x6b\x3f\x7b\x14\x2e\xbe\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x80\x3f\x00\x00")
    # var result = socket.sendTo("127.0.0.1", Port(8053), buffer, offset)

    # echo result
    # if usleep(1000*1000) != 0: # 1000ms
    #     echo "errno"
    #     echo errno
    # else:
    #     echo "Slept"



# Test

# var socket = newSocket()
# socket.bindAddr(Port(1234))
# socket.listen()

# var client = newSocket()
# var address = ""
# while true:
#   socket.acceptAddr(client, address)
#   echo("Client connected from: ", address)
