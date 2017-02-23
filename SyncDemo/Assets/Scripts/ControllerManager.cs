// Hololens Compatibility:
#if UNITY_STANDALONE_WIN && !UNITY_WSA_10_0
namespace Giverspace {
	using UnityEngine;

	public class ControllerManager : MonoBehaviour {
		[SerializeField] SteamVR_TrackedObject _controllerTrackedObject;
		[SerializeField] ControllerAttachmentVisualizer _visualizer;
		
		public void UpdateControllerAttachment (ControllerAttachmentType attachmentType) {
			_visualizer.UpdateControllerAttachment(attachmentType);
		}

		public SteamVR_TrackedObject TrackedObject {
			get {
				return _controllerTrackedObject;
			}
		}
	}
}
#endif