namespace Giverspace {
	using UnityEngine;

	[System.Serializable]
	public struct ControllerAttachmentTypeToPrefab {
		public ControllerAttachmentType ControllerAttachmentType;
		public GameObject Prefab;
	}

	[CreateAssetMenu]
	public class ControllerAttachmentsToPrefabs : ScriptableObject {
		[SerializeField] ControllerAttachmentTypeToPrefab[] _controllerAttachmentTypeToPrefabs;

		// NOTE(JULIAN): We could cache the lookup, but a linear search should be fine here
		public GameObject PrefabForAttachmentType (ControllerAttachmentType attachmentType) {
			foreach (var attachmentToPrefab in _controllerAttachmentTypeToPrefabs) {
				if (attachmentToPrefab.ControllerAttachmentType == attachmentType) {
					return attachmentToPrefab.Prefab;
				}
			}
			return null;
		}

		public int HighestAttachmentIndex {
			get {
				int highest = -1;
				foreach (var attachmentToPrefab in _controllerAttachmentTypeToPrefabs) {
					if ((int)(attachmentToPrefab.ControllerAttachmentType) > highest) {
						highest = (int)attachmentToPrefab.ControllerAttachmentType;
					}
				}
				return highest;
			}
		}
	}
}