namespace Giverspace {
	using UnityEngine;

	public class ControllerManager : MonoBehaviour {
// Hololens compatibility:
#if (UNITY_STANDALONE_WIN && !UNITY_EDITOR) && !UNITY_WSA_10_0
		[SerializeField] SteamVR_TrackedObject _controllerTrackedObject;
#endif
		[SerializeField] ControllerAttachmentVisualizer _visualizer;
		
		public void UpdateControllerAttachment (ControllerAttachmentType attachmentType) {
			_visualizer.UpdateControllerAttachment(attachmentType);
		}

#if (UNITY_STANDALONE_WIN && !UNITY_EDITOR) && !UNITY_WSA_10_0
		public SteamVR_TrackedObject TrackedObject {
			get {
				return _controllerTrackedObject;
			}
		}
#endif

	}
}