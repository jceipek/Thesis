import net
import posix #for usleep

var socket = newSocket(Domain.AF_INET, SockType.SOCK_DGRAM, Protocol.IPPROTO_UDP, true)
bindAddr(socket, Port(0), "")

while true:
    var result = socket.sendTo("127.0.0.1", Port(58504), "\x00\x00\x00\x00\xf6\x28\xbc\x3f\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x80\x3f\x33\x33\x33\xbe\x1f\x85\x6b\x3f\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x80\x3f\x00\x00\xd1\x22\xab\x3f\x1f\x85\x6b\x3f\x7b\x14\x2e\xbe\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x80\x3f\x00\x00")
    if result == -1:
        var e = getSocketError(socket)
        echo e
    echo result
    if usleep(1000*1000) != 0: # 1000ms
        echo errno
    else:
        echo "Slept"

# var socket = newSocket()
# socket.bindAddr(Port(1234))
# socket.listen()

# var client = newSocket()
# var address = ""
# while true:
#   socket.acceptAddr(client, address)
#   echo("Client connected from: ", address)