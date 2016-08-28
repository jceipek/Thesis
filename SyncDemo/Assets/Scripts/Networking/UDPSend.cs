/*
 
    -----------------------
    UDP-Send
    -----------------------
    // [url]http://msdn.microsoft.com/de-de/library/bb979228.aspx#ID0E3BAC[/url]
   
    // > gesendetes unter
    // 127.0.0.1 : 8050 empfangen
   
    // nc -lu 127.0.0.1 8050
 
        // todo: shutdown thread at the end
*/
using UnityEngine;
using System.Collections;
 
using System;
using System.Text;
using System.Net;
using System.Net.Sockets;
using System.Threading;
 
public class UDPSend : MonoBehaviour {
    private static int _localPort;
   
    // prefs
    private string _IP;  // define in init
    public int _port;  // define in init
   
    // "connection" things
    IPEndPoint _remoteEndPoint;
    UdpClient _client;
   
    // gui
    string _strMessage = "";
   
    public void Start () {
        Init();
    }
   
    // OnGUI
    void OnGUI () {
        Rect rectObj=new Rect(40,380,200,400);
            GUIStyle style = new GUIStyle();
                style.alignment = TextAnchor.UpperLeft;
        GUI.Box(rectObj,"# UDPSend-Data\n127.0.0.1 "+_port+" #\n"
                    + "shell> nc -lu 127.0.0.1  "+_port+" \n"
                ,style);
       
        // ------------------------
        // send it
        // ------------------------
        _strMessage = GUI.TextField(new Rect(40,420,140,20), _strMessage);
        if (GUI.Button(new Rect(190,420,40,20),"send")) {
            SendString(_strMessage+"\n");
        }      
    }
   
    // init
    public void Init () {
        // Endpunkt definieren, von dem die Nachrichten gesendet werden.
        print("UDPSend.init()");
       
        // define
        _IP = "127.0.0.1";
        _port = 8051;
       
        // ----------------------------
        // Senden
        // ----------------------------
        _remoteEndPoint = new IPEndPoint(IPAddress.Parse(_IP), _port);
        _client = new UdpClient();
       
        // status
        print("Sending to "+_IP+" : "+_port);
        print("Testing: nc -lu "+_IP+" : "+_port);
   
    }
 
    // inputFromConsole
    private void InputFromConsole () {
        try {
            string text;
            do {
                text = Console.ReadLine();
 
                // Den Text zum Remote-Client senden.
                if (text != "") {
                    // Daten mit der UTF8-Kodierung in das Binärformat kodieren.
                    byte[] data = Encoding.UTF8.GetBytes(text);
 
                    // Den Text zum Remote-Client senden.
                    _client.Send(data, data.Length, _remoteEndPoint);
                }
            } while (text != "");
        } catch (Exception err) {
            print(err.ToString());
        }
 
    }
 
    // sendData
    private void SendString (string message) {
        try {
                //if (message != "")
                //{
 
                    // Daten mit der UTF8-Kodierung in das Binärformat kodieren.
                    byte[] data = Encoding.UTF8.GetBytes(message);
 
                    // Den message zum Remote-Client senden.
                    _client.Send(data, data.Length, _remoteEndPoint);
                //}
        }
        catch (Exception err) {
            print(err.ToString());
        }
    }
   
   
    // endless test
    private void SendEndless (string testStr) {
        do {
            SendString(testStr);
        } while(true);
    }
   
}