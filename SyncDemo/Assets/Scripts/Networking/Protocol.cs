namespace Giverspace {
using UnityEngine;

public enum MessageType {
  Unknown = -1,
  Position = 0X00,
  PositionRotation = 0X01,
  Segment = 0X02
}

public struct NetMessage {
	public MessageType MessageType;
	public int SequenceNumber;
	public ushort ObjectId;
	public Vector3 Position;
	public Quaternion Rotation;
	public Vector3 Destination;
	public Color32 Color;
	static MessageType MessageTypeFromBuff (byte[] data, ref int offset) {
  		MessageType res = (MessageType)data[offset];
  		offset += 1;
  		return res;
  	}

  	static float FloatFromBuff (byte[] data, ref int offset) {
  		float res = System.BitConverter.ToSingle(data, offset);
  		offset += 4;
  		return res;
  	}

  	static int Int32FromBuff (byte[] data, ref int offset) {
  		int res = (data[offset+0] & 0xFF)
  		        | ((data[offset+1] & 0xFF) << 8) 
  		        | ((data[offset+2] & 0xFF) << 16) 
  		        | ((data[offset+3] & 0xFF) << 24);
  		offset += 4;
  		return res;
  	}

  	static ushort UInt16FromBuff (byte[] data, ref int offset) {
  		ushort res = System.BitConverter.ToUInt16(data, offset);
  		offset += 2;
  		return res;
  	}

  	static Vector3 Vector3FromBuff (byte[] data, ref int offset) {
  		float x = FloatFromBuff(data, ref offset);
  		float y = FloatFromBuff(data, ref offset);
  		float z = FloatFromBuff(data, ref offset);
  		return new Vector3(x, y, z);
  	}

  	static Color32 ColorFromBuff (byte[] data, ref int offset) {
  		byte r = data[offset];
  		byte g = data[offset+1];
  		byte b = data[offset+2];
  		byte a = data[offset+3];
  		offset += 4;
  		return new Color32(r,g,b,a);
  	}

  	static Quaternion QuaternionFromBuff (byte[] data, ref int offset) {
  		float x = FloatFromBuff(data, ref offset);
  		float y = FloatFromBuff(data, ref offset);
  		float z = FloatFromBuff(data, ref offset);
  		float w = FloatFromBuff(data, ref offset);
  		return new Quaternion(x, y, z, w); // NOTE(JULIAN): w comes first in the buffer but last in the constructor
  	}

	private static NetMessage DecodePosition (byte[] data, ref int offset) {
		return new NetMessage { MessageType = MessageType.Position,
		                        SequenceNumber = Int32FromBuff(data, ref offset),
		                        ObjectId = UInt16FromBuff(data, ref offset),
		                        Position = Vector3FromBuff(data, ref offset) };
	}

	private static NetMessage DecodePositionRotation (byte[] data, ref int offset) {
		return new NetMessage { MessageType = MessageType.PositionRotation,
		                        SequenceNumber = Int32FromBuff(data, ref offset),
		                        ObjectId = UInt16FromBuff(data, ref offset),
		                        Position = Vector3FromBuff(data, ref offset),
		                        Rotation = QuaternionFromBuff(data, ref offset) };
	}

	private static NetMessage DecodeSegment (byte[] data, ref int offset) {
		return new NetMessage { MessageType = MessageType.Segment,
		                        SequenceNumber = Int32FromBuff(data, ref offset),
		                        ObjectId = UInt16FromBuff(data, ref offset),
		                        Position = Vector3FromBuff(data, ref offset),
		                        Destination = Vector3FromBuff(data, ref offset),
		                        Color = ColorFromBuff(data, ref offset) };
	}

	public static bool DecodeMessage (byte[] buffer, int messageLength, out NetMessage decodedMessage) {
		if (messageLength > 0) {
			int offset = 0;
			var messageType = MessageTypeFromBuff(buffer, ref offset);
			switch (messageType) {
  				case MessageType.Position:
  					if (messageLength == 19) {
  						decodedMessage = DecodePosition(buffer, ref offset);
  						return true;
  					}
  					break;
  				case MessageType.PositionRotation:
  					if (messageLength == 35) {
  						decodedMessage = DecodePositionRotation(buffer, ref offset);
  						return true;
  					}
  					break;
  				case MessageType.Segment:
  					if (messageLength == 35) {
  						decodedMessage = DecodeSegment(buffer, ref offset);
  						return true;
  					}
  					break;
				default:
					break;
			}
		}
		decodedMessage = new NetMessage { MessageType = MessageType.Unknown };
		return false;
	}
}

}
