namespace Giverspace {

using UnityEngine;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.IO;

public class NetManager : MonoBehaviour {

    public static NetManager G = null; 
    [SerializeField] string _serverIPAddress = "127.0.0.1";
    [SerializeField] int _ioPort = 8053;
    [SerializeField] IOLayer _ioLayer;

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
        if (G == null) {
            G = this;
            _sendBufferStream = new MemoryStream(_sendBuffer);
            _sendBufferWriter = new BinaryWriter(_sendBufferStream);

            _servIPEP = new IPEndPoint(IPAddress.Parse(_serverIPAddress), port: _ioPort);
            _servEP = (EndPoint)_servIPEP;

            _clientIPEP = new IPEndPoint(IPAddress.Any, _ioPort);
            _clientEP = (EndPoint)_clientIPEP;
            _clientSock.Bind(_clientEP);


            var t_Consumer = new Thread(new ThreadStart(Reader));
            t_Consumer.IsBackground = true;
            t_Consumer.Start();
            _running = true;
        } else {
            return;
        }
    }

    void Update () {
        // if (_writeMessageBuffer.Count > 0) {
            _readMessageBuffer = Interlocked.Exchange(ref _writeMessageBuffer, _readMessageBuffer);
            // Debug.Log(_readMessageBuffer.Count);
            for (int i = 0; i < _readMessageBuffer.Count; i++) {
                _ioLayer.ProcessMessage(_readMessageBuffer.InternalBuffer[i]);
                // Debug.Log(_readMessageBuffer.InternalBuffer[i]);
            }
            _readMessageBuffer.Count = 0;
        // }


        // SendControllerPositions(Vector3.zero, Quaternion.identity, false,
        //                         Vector3.zero, Quaternion.identity, false);

        // var leftState = _leftController.index != SteamVR_TrackedObject.EIndex.None? SteamVR_Controller.Input((int)_leftController.index).GetState() : new VRControllerState_t();
        // var rightState = _rightController.index != SteamVR_TrackedObject.EIndex.None? SteamVR_Controller.Input((int)_rightController.index).GetState() : new VRControllerState_t();
        // SendControllerDataMessage(leftState, rightState);

        // SendStringMessage("Hello, universe!");
    }

    [SerializeField] int _debug;
    void Reader () {
        int mostRecentNum = 0;
        NetMessage message;
        while (_running) {
            int dataLength = 0;
            int available = 0;
            try {
                available = _clientSock.Available;
                _debug = available;
            } catch (System.Exception e) {
                Debug.Log(e);
            }
            if (available > 0) {
                    dataLength = _clientSock.ReceiveFrom(_receiveBuffer, 0, _receiveBuffer.Length, SocketFlags.None, ref _servEP);
                    // Debug.Log(e);
                // }
                if (NetMessage.DecodeMessage(_receiveBuffer, dataLength, out message)) {
                    // if (message.SequenceNumber > mostRecentNum) {
                        _writeMessageBuffer.Add(message);
                        mostRecentNum = message.SequenceNumber;
                    // }
                } else {
                    Debug.Log("Undecodable");
                }
            }
        }
        Debug.Log("Stopping Read Thread");
    }

    void SendStringMessage (string message) {
        _sendBufferStream.Position = 0;
        _sendBufferWriter.Write(message);
        // XXX(Julian): Serializing _servEP is an allocation!!!
        _clientSock.SendTo(_sendBuffer, (int)_sendBufferStream.Position, SocketFlags.None, _servEP);
    }

    public void SendControllerPositions (Vector3 position1, Quaternion rotation1, bool grab1,
                                         Vector3 position2, Quaternion rotation2, bool grab2) {
        _sendBufferStream.Position = 0;
        _sendBufferWriter.Write(position1.x);
        _sendBufferWriter.Write(position1.y);
        _sendBufferWriter.Write(position1.z);
        _sendBufferWriter.Write(rotation1.x);
        _sendBufferWriter.Write(rotation1.y);
        _sendBufferWriter.Write(rotation1.z);
        _sendBufferWriter.Write(rotation1.w);
        _sendBufferWriter.Write(grab1);

        _sendBufferWriter.Write(position2.x);
        _sendBufferWriter.Write(position2.y);
        _sendBufferWriter.Write(position2.z);
        _sendBufferWriter.Write(rotation2.x);
        _sendBufferWriter.Write(rotation2.y);
        _sendBufferWriter.Write(rotation2.z);
        _sendBufferWriter.Write(rotation2.w);
        _sendBufferWriter.Write(grab2);

        try {
            _clientSock.SendTo(_sendBuffer, (int)_sendBufferStream.Position, SocketFlags.None, _servEP);
        } catch (System.Exception e) {
            Debug.Log(e);
        }
    }

    bool _running = true;
    void OnDisable () {
        _running = false;
        Debug.Log("Disable!");
    }

}   
}