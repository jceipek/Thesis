using UnityEngine;
using System.Net;
using System.Net.Sockets;
using System.Threading;

using System.Text;
using System.IO;


public class Demo2 : MonoBehaviour {

    [SerializeField] GameObject _objectPrefab;
    GameObject[] _objects = new GameObject[1000]; 

    Socket _clientSock = new Socket(AddressFamily.InterNetwork, // IPv4
                                    SocketType.Dgram, 
                                    ProtocolType.Udp);
    IPEndPoint _servIPEP;
    EndPoint _servEP;

    IPEndPoint _clientIPEP;
    EndPoint _clientEP;

    const int MAX_MESSAGE_LENGTH = 1024;
    byte[] _sendBuffer = new byte[MAX_MESSAGE_LENGTH];
    byte[] _receiveBuffer = new byte[MAX_MESSAGE_LENGTH];
    MemoryStream _sendBufferStream;
    BinaryWriter _sendBufferWriter;

    const int MAX_MESSAGE_COUNT = 2048*2;
    FixedSizeBuffer<NetMessage> _writeMessageBuffer = new FixedSizeBuffer<NetMessage>(MAX_MESSAGE_COUNT);
    FixedSizeBuffer<NetMessage> _readMessageBuffer = new FixedSizeBuffer<NetMessage>(MAX_MESSAGE_COUNT);

    enum MessageType {
        Default = 0
    }

    private struct NetMessage {
        public MessageType MessageType;
        public int SequenceNumber;
        public ushort ObjectId;
        public Vector3 Position;
        // public Quaternion Rotation;
        // public Vector3 Scale;

        public static MessageType MessageTypeFromBuff (byte[] data, ref int offset) {
            MessageType res = (MessageType)data[offset];
            offset += 1;
            return res;
        }

        public static ushort UShortFromBuff (byte[] data, ref int offset) {
            ushort res = System.BitConverter.ToUInt16(data, offset);
            offset += 2;
            return res;
        }

        public static int IntFromBuff (byte[] data, ref int offset) {
            int res = (data[offset+0] & 0xFF)
                    | ((data[offset+1] & 0xFF) << 8) 
                    | ((data[offset+2] & 0xFF) << 16) 
                    | ((data[offset+3] & 0xFF) << 24);
            offset += 4;
            return res;
        }

        public static float FloatFromBuff (byte[] data, ref int offset) {
            float res = System.BitConverter.ToSingle(data, offset);
            offset += 4;
            return res;
        }

        public static Vector3 V3FromBuff (byte[] data, ref int offset) {
            float x = FloatFromBuff(data, ref offset);
            float y = FloatFromBuff(data, ref offset);
            float z = FloatFromBuff(data, ref offset);
            return new Vector3(x, y, z);
        }

        public static NetMessage DecodeObjectPos (byte[] data) {
            int offset = 0;
            return new NetMessage { MessageType = MessageTypeFromBuff(data, ref offset),
                                    SequenceNumber = IntFromBuff(data, ref offset),
                                    ObjectId = UShortFromBuff(data, ref offset),
                                    Position = V3FromBuff(data, ref offset) };
        }

    }

    class FixedSizeBuffer<T> {
        public readonly int Capacity;
        public int Count;
        public readonly T[] InternalBuffer;
        public FixedSizeBuffer (int capacity) {
            Capacity = capacity;
            InternalBuffer = new T[capacity];
            Count = 0;
        }

        public void Add (T item) {
            if (Count < MAX_MESSAGE_COUNT-1) {
                InternalBuffer[Count] = item;
                Count++;
            }
            // Interlocked.Increment(ref Count);
        }
    }

    void Start () {
        _sendBufferStream = new MemoryStream(_sendBuffer);
        _sendBufferWriter = new BinaryWriter(_sendBufferStream);

        _servIPEP = new IPEndPoint(IPAddress.Parse("127.0.0.1"), port: 8053);
        _servEP = (EndPoint)_servIPEP;

        _clientIPEP = new IPEndPoint(IPAddress.Any, 8053);
        _clientEP = (EndPoint)_clientIPEP;
        _clientSock.Bind(_clientEP);


        var t_Consumer = new Thread(new ThreadStart(Reader));
        t_Consumer.IsBackground = true;
        t_Consumer.Start();
    }

    // private static AutoResetEvent tellConsumerToConsume = new AutoResetEvent(false);
    // tellConsumerToConsume.Set();
    // while(tellConsumerToConsume.WaitOne()) {
    //     string text = Encoding.UTF8.GetString(buf);
    //     Debug.Log("Got: "+text);
    // }
    void Update () {
        _readMessageBuffer = Interlocked.Exchange(ref _writeMessageBuffer, _readMessageBuffer);
        // Debug.Log(_readMessageBuffer.Count);
        for (int i = 0; i < _readMessageBuffer.Count; i++) {
            var msg = _readMessageBuffer.InternalBuffer[i];
            if (msg.ObjectId < _objects.Length) {
                // Debug.Log("ID: "+msg.ObjectId);
                if (_objects[msg.ObjectId] == null) {
                    _objects[msg.ObjectId] = Instantiate(_objectPrefab);
                }
                _objects[msg.ObjectId].transform.position = msg.Position;
            }

            
            // Debug.Log(_readMessageBuffer.InternalBuffer[i]);
        }
        _readMessageBuffer.Count = 0;

        // SendStringMessage("Hello, universe!");
    }

    void SendStringMessage (string message) {
        _sendBufferStream.Position = 0;
        _sendBufferWriter.Write(message);
        // XXX(Julian): Serializing _servEP is an allocation!!!
        _clientSock.SendTo(_sendBuffer, (int)_sendBufferStream.Position, SocketFlags.None, _servEP);
    }

    void Reader () {
        int mostRecentNum = 0;
        while (true) {
            int rcv = _clientSock.ReceiveFrom(_receiveBuffer, 0, _receiveBuffer.Length, SocketFlags.None, ref _servEP);
            if (rcv == 23) {
                var msg = NetMessage.DecodeObjectPos(_receiveBuffer);
                if (msg.SequenceNumber > mostRecentNum) {
                    _writeMessageBuffer.Add(msg);
                    mostRecentNum = msg.SequenceNumber;
                }
                // Debug.LogFormat("Type: {0}, #: {1}, O#: {2}",msg.MessageType, msg.SequenceNumber, msg.ObjectId);
            }

            // if (_writeMessageBuffer.Count > 3) {
            //     _readMessageBuffer = Interlocked.Exchange(ref _writeMessageBuffer, _readMessageBuffer);
            // }
            // Debug.Log("rcv: " + rcv);
            // string text = Encoding.UTF8.GetString(_receiveBuffer, 0, rcv);
            // _writeMessageBuffer.Add(text);
        }
    }

}