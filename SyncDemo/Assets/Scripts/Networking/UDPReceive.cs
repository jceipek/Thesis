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
 
public class UDPReceive : MonoBehaviour {
   
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
   
    // start from unity3d
    public void Start() {
        Init();
    }
   
    // OnGUI
    void OnGUI() {
        Rect rectObj=new Rect(40,10,200,400);
            GUIStyle style = new GUIStyle();
                style.alignment = TextAnchor.UpperLeft;
        GUI.Box(rectObj,"# UDPReceive\n127.0.0.1 "+_port+" #\n"
                    + "shell> nc -u 127.0.0.1 : "+_port+" \n"
                    + "\nLast Packet: \n"+ _lastReceivedUDPPacket
                    + "\n\nAll Messages: \n"+_allReceivedUDPPackets
                ,style);
    }
       
    // init
    private void Init() {
        // Endpunkt definieren, von dem die Nachrichten gesendet werden.
        print("UDPSend.init()");
       
        // define port
        _port = 8051;
 
        // status
        print("Sending to 127.0.0.1 : "+_port);
        print("Test-Sending to this Port: nc -u 127.0.0.1  "+_port+"");
 
   
        // ----------------------------
        // Abhören
        // ----------------------------
        // Lokalen Endpunkt definieren (wo Nachrichten empfangen werden).
        // Einen neuen Thread für den Empfang eingehender Nachrichten erstellen.
        _receiveThread = new Thread(
            new ThreadStart(ReceiveData));
        _receiveThread.IsBackground = true;
        _receiveThread.Start();
 
    }
 
    // receive thread
    private void ReceiveData() {
 
        _client = new UdpClient(_port);
        while (true) {
 
            try {
                // Bytes empfangen.
                IPEndPoint anyIP = new IPEndPoint(IPAddress.Any, 0);
                byte[] data = _client.Receive(ref anyIP);
 
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