/*
 
    -----------------------
    UDP-Receive (send to)
    -----------------------
    // [url]http://msdn.microsoft.com/de-de/library/bb979228.aspx#ID0E3BAC[/url]
   
   
    // > receive
    // 127.0.0.1 : 8051
   
    // send
    // nc -u 127.0.0.1 8051
 
*/
using UnityEngine;
using System.Collections;
 
using System;
using System.Text;
using System.Net;
using System.Net.Sockets;
using System.Threading;
 
public class Demo : MonoBehaviour {
   
    // Note(Julian): May need to change this number to suit our needs
    const int BUFFER_SIZE = 100;

    private static Demo _instance;


    public static void Exit () {
        if (_instance != null) {
            // _instance.Message("Stopped");
            // _instance.Flush();
            _instance = null;
        }
    }

    enum MessageType {
        Default = 0
    }

    private struct NetMessage {
        public MessageType MessageType;
        public int SequenceNumber;
        public ushort ObjectId;
        public Vector3 Position;
        public Quaternion Rotation;
        // public Vector3 Scale;
    }

    int _messageBufferPointer = 0;
    static NetMessage[] _messageBuffer = new NetMessage[BUFFER_SIZE];
    static NetMessage[] _messageWriteBuffer = new NetMessage[BUFFER_SIZE];
    static string _logFileName;

        private static AutoResetEvent tellConsumerToConsume = new AutoResetEvent(false);
        static int _newMessageCount = 0;
        private static void ConsumeItem() {
            // using (TextWriter w = new StreamWriter (_logFileName, true)) {
                while(tellConsumerToConsume.WaitOne()) {
                    for (int i = 0; i < _newMessageCount; i++) {
                        NetMessage m = _messageWriteBuffer[i];
                        // m.WriteWith((StreamWriter)w);
                    }
                    // w.Flush();
                }
            // }
        }

        public void Flush () {
            _messageWriteBuffer = Interlocked.Exchange(ref _messageBuffer, _messageWriteBuffer);
            _newMessageCount = Interlocked.Exchange(ref _messageBufferPointer, 0);
            tellConsumerToConsume.Set();
        }

    void Enqueue (NetMessage message) {
        _messageBuffer[_messageBufferPointer] = message;
        _messageBufferPointer++;

        // if (_messageBufferPointer > FLUSH_SIZE) {
        //     Flush();
        // }
    }

    private void Start () {
        // Unique FileName with date in it. And ProcessId so the same process running twice will log to different files
        // string lp = oneLogPerProcess ? "_" + System.Diagnostics.Process.GetCurrentProcess().Id : "";
        // _logFileName = (fileName == "") ? string.Format("{0}{1}{2}-{3}-{4}_{5}",
        //                                                 Application.persistentDataPath,
        //                                                 Path.DirectorySeparatorChar,
        //                                                 DateTime.Now.Year.ToString("0000"),
        //                                                 DateTime.Now.Month.ToString("00"),
        //                                                 DateTime.Now.Day.ToString("00"),
        //                                                 lp) : fileName;
        // int i = 0;
        // while (File.Exists(string.Format("{0}{1}.log",_logFileName,i))) {
        //     i++;
        // }
        // _logFileName = string.Format("{0}{1}.log",_logFileName,i);
        // Debug.Log(string.Format("Logging Metrics to {0}",_logFileName));

        if (_instance == null) {
            _instance = this;

            Debug.Log("Started Network Listener");

            // var t_Consumer = new Thread(new ThreadStart(ConsumeItem));
            // t_Consumer.IsBackground = true;
            // t_Consumer.Start();

        
            // define port
            _port = 8051;    
    


            _receiveThread = new Thread(
                new ThreadStart(ReceiveData));
            _receiveThread.IsBackground = true;
            _receiveThread.Start();
        }
    }


    // receiving Thread
    Thread _receiveThread;
 
    // udpclient object
    UdpClient _client;
 
    // public
    // public string IP = "127.0.0.1"; default local
    public int _port; // define > init
 
    // infos
    public string _lastReceivedUDPPacket = "";
    public string _allReceivedUDPPackets = ""; // clean up this from time to time!
   
    // OnGUI
    // void OnGUI() {
    //     Rect rectObj=new Rect(40,10,200,400);
    //         GUIStyle style = new GUIStyle();
    //             style.alignment = TextAnchor.UpperLeft;
    //     GUI.Box(rectObj,"# UDPReceive\n127.0.0.1 "+_port+" #\n"
    //                 + "shell> nc -u 127.0.0.1 : "+_port+" \n"
    //                 + "\nLast Packet: \n"+ _lastReceivedUDPPacket
    //                 + "\n\nAll Messages: \n"+_allReceivedUDPPackets
    //             ,style);
    // }
 
    // receive thread
    private void ReceiveData () {

        _client = new UdpClient(_port);
        while (true) {
 
            try {
                // Bytes empfangen.
                IPEndPoint anyIP = new IPEndPoint(IPAddress.Any, 0);
                byte[] data = _client.Receive(ref anyIP);

                // _client.
 
                // Bytes mit der UTF8-Kodierung in das Textformat kodieren.
                string text = Encoding.UTF8.GetString(data);
 
                // Den abgerufenen Text anzeigen.
                print(">> " + text);
               
                // latest UDPpacket
                _lastReceivedUDPPacket = text;
               
                // ....
                _allReceivedUDPPackets = _allReceivedUDPPackets+text;
               
            } catch (Exception err) {
                print(err.ToString());
            }
        }
    }
   
    // getLatestUDPPacket
    // cleans up the rest
    public string GetLatestUDPPacket () {
        _allReceivedUDPPackets = "";
        return _lastReceivedUDPPacket;
    }
}