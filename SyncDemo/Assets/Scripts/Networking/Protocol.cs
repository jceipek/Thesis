namespace Giverspace {
using UnityEngine;

public enum MessageType {
  Unknown = -1,
  Position = 0X00,
  PositionRotation = 0X01,
  PositionRotationScaleModel = 0X02,
  PositionRotationScaleVisibleTintModel = 0X03,
  PositionRotationVelocityColor = 0X04,
  Segment = 0X05,
  SimulationTime = 0X06,
  ControllerAttachment = 0X07
}

public struct ControllerAttachmentTypes {
	public ControllerAttachmentType a;
	public ControllerAttachmentType b;
	public ControllerAttachmentTypes (ControllerAttachmentType a, ControllerAttachmentType b) {
		this.a = a;
		this.b = b;
	}
}
public enum ControllerAttachmentType {
  None = 0X00,
  Grab = 0X01,
  Delete = 0X02
}

public enum ModelType {
  None = 0X00,
  Headset = 0X01,
  ControllerBase = 0X02,
  ControllerAttachment_Marker = 0X03,
  ControllerAttachment_Pointer = 0X04,
  ControllerAttachment_Vacuum = 0X05,
  ControllerAttachment_Wrench = 0X06,
  Oven = 0X07,
  Oven_CancelButton = 0X08,
  Oven_ProjectionSpace = 0X09,
  Oven_SingleStepBackButton = 0X0A,
  Oven_SingleStepForwardButton = 0X0B,
  Clock = 0X0C,
  Clock_FreezeStateButton = 0X0D,
  Clock_PlayPauseButton = 0X0E,
  Clock_ResetStateButton = 0X0F,
  Clock_SingleStepButton = 0X10,
  Cube = 0X11,
  Sphere = 0X12,
  Cylinder = 0X13,
  Shelf = 0X14,
  Pedestal = 0X15,
  ControllerAttachment_Pliers = 0X16
}

public struct NetMessage {
	public MessageType MessageType;
	public int SequenceNumber;
	public ushort ObjectId;
	public Vector3 Position;
	public Quaternion Rotation;
	public ModelType ModelType;
	public Vector3 Scale;
	public bool Visible;
	public Color32 Tint;
	public Vector3 Velocity;
	public Color32 Color;
	public Vector3 Destination;
	public float Time;
	public ControllerAttachmentTypes ControllerAttachments;
	static MessageType MessageTypeFromBuff (byte[] data, ref int offset) {
  		MessageType res = (MessageType)data[offset];
  		offset += 1;
  		return res;
  	}

  	static ControllerAttachmentTypes ControllerAttachmentTypesFromBuff (byte[] data, ref int offset) {
  		ControllerAttachmentType res0 = (ControllerAttachmentType)data[offset];
  		offset += 1;
  		ControllerAttachmentType res1 = (ControllerAttachmentType)data[offset];
  		offset += 1;
  		return new ControllerAttachmentTypes(res0, res1);
  	}

  	static ModelType ModelTypeFromBuff (byte[] data, ref int offset) {
  		ModelType res = (ModelType)UInt16FromBuff(data, ref offset);
  		return res;
  	}

  	static bool BoolFromBuff (byte[] data, ref int offset) {
  		bool res = data[offset] == 0x01;
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
  		return new Quaternion(x, y, z, w);
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

	private static NetMessage DecodePositionRotationScaleModel (byte[] data, ref int offset) {
		return new NetMessage { MessageType = MessageType.PositionRotationScaleModel,
		                        SequenceNumber = Int32FromBuff(data, ref offset),
		                        ObjectId = UInt16FromBuff(data, ref offset),
		                        ModelType = ModelTypeFromBuff(data, ref offset),
		                        Position = Vector3FromBuff(data, ref offset),
		                        Rotation = QuaternionFromBuff(data, ref offset),
		                        Scale = Vector3FromBuff(data, ref offset) };
	}

	private static NetMessage DecodePositionRotationScaleVisibleTintModel (byte[] data, ref int offset) {
		return new NetMessage { MessageType = MessageType.PositionRotationScaleVisibleTintModel,
		                        SequenceNumber = Int32FromBuff(data, ref offset),
		                        ObjectId = UInt16FromBuff(data, ref offset),
		                        ModelType = ModelTypeFromBuff(data, ref offset),
		                        Position = Vector3FromBuff(data, ref offset),
		                        Rotation = QuaternionFromBuff(data, ref offset),
		                        Scale = Vector3FromBuff(data, ref offset),
		                        Visible = BoolFromBuff(data, ref offset),
		                        Tint = ColorFromBuff(data, ref offset) };
	}

	private static NetMessage DecodePositionRotationVelocityColor (byte[] data, ref int offset) {
		return new NetMessage { MessageType = MessageType.PositionRotationVelocityColor,
		                        SequenceNumber = Int32FromBuff(data, ref offset),
		                        ObjectId = UInt16FromBuff(data, ref offset),
		                        Position = Vector3FromBuff(data, ref offset),
		                        Rotation = QuaternionFromBuff(data, ref offset),
		                        Velocity = Vector3FromBuff(data, ref offset),
		                        Color = ColorFromBuff(data, ref offset) };
	}

	private static NetMessage DecodeSegment (byte[] data, ref int offset) {
		return new NetMessage { MessageType = MessageType.Segment,
		                        SequenceNumber = Int32FromBuff(data, ref offset),
		                        ObjectId = UInt16FromBuff(data, ref offset),
		                        Position = Vector3FromBuff(data, ref offset),
		                        Destination = Vector3FromBuff(data, ref offset),
		                        Color = ColorFromBuff(data, ref offset) };
	}

	private static NetMessage DecodeSimulationTime (byte[] data, ref int offset) {
		return new NetMessage { MessageType = MessageType.SimulationTime,
		                        SequenceNumber = Int32FromBuff(data, ref offset),
		                        Time = FloatFromBuff(data, ref offset) };
	}

	private static NetMessage DecodeControllerAttachment (byte[] data, ref int offset) {
		return new NetMessage { MessageType = MessageType.ControllerAttachment,
		                        SequenceNumber = Int32FromBuff(data, ref offset),
		                        ControllerAttachments = ControllerAttachmentTypesFromBuff(data, ref offset) };
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
  				case MessageType.PositionRotationScaleModel:
  					if (messageLength == 49) {
  						decodedMessage = DecodePositionRotationScaleModel(buffer, ref offset);
  						return true;
  					}
  					break;
  				case MessageType.PositionRotationScaleVisibleTintModel:
  					if (messageLength == 54) {
  						decodedMessage = DecodePositionRotationScaleVisibleTintModel(buffer, ref offset);
  						return true;
  					}
  					break;
  				case MessageType.PositionRotationVelocityColor:
  					if (messageLength == 51) {
  						decodedMessage = DecodePositionRotationVelocityColor(buffer, ref offset);
  						return true;
  					}
  					break;
  				case MessageType.Segment:
  					if (messageLength == 35) {
  						decodedMessage = DecodeSegment(buffer, ref offset);
  						return true;
  					}
  					break;
  				case MessageType.SimulationTime:
  					if (messageLength == 9) {
  						decodedMessage = DecodeSimulationTime(buffer, ref offset);
  						return true;
  					}
  					break;
  				case MessageType.ControllerAttachment:
  					if (messageLength == 7) {
  						decodedMessage = DecodeControllerAttachment(buffer, ref offset);
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
