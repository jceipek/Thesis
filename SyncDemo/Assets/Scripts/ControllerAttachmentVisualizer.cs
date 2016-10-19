namespace Giverspace {
	using UnityEngine;

	[System.Serializable]
	public struct ControllerAttachmentTypeToPrefab {
		public ControllerAttachmentType ControllerAttachmentType;
		public GameObject Prefab;
	}

	public class ControllerAttachmentVisualizer : MonoBehaviour {
		[SerializeField] ControllerAttachmentTypeToPrefab[] _controllerAttachmentTypeToPrefabs;

		static GameObject[] _prefabsForModels;
		GameObject[] _instancedModels;
		GameObject _model;
		ControllerAttachmentType _controllerAttachment = ControllerAttachmentType.None;

		bool _initialized = false; 
		void Init () {
			int maxIndex = -1;
			for (int i = 0; i < _controllerAttachmentTypeToPrefabs.Length; i++) {
				if ((int)_controllerAttachmentTypeToPrefabs[i].ControllerAttachmentType > maxIndex) {
					maxIndex = (int)_controllerAttachmentTypeToPrefabs[i].ControllerAttachmentType;
				}
			}
			_prefabsForModels = new GameObject[maxIndex+1];
			_instancedModels = new GameObject[maxIndex+1];
			for (int i = 0; i < _controllerAttachmentTypeToPrefabs.Length; i++) {
				_prefabsForModels[(int)_controllerAttachmentTypeToPrefabs[i].ControllerAttachmentType] = _controllerAttachmentTypeToPrefabs[i].Prefab;
			}
			_initialized = true;
		}

		GameObject PrefabForAttachmentType (ControllerAttachmentType attachmentType) {
			return _prefabsForModels[(int)attachmentType];
		}

		public void UpdateControllerAttachment (ControllerAttachmentType attachmentType) {
			if (!_initialized) {
				Init();
			}
			if (_controllerAttachment != attachmentType) {
				if (_model != null) {
					_model.SetActive(false);
				}
				_controllerAttachment = attachmentType;
				if (_instancedModels[(int)attachmentType] == null && attachmentType != ControllerAttachmentType.None) {
					_model = Instantiate(PrefabForAttachmentType(attachmentType), Vector3.zero, Quaternion.identity) as GameObject;
					_model.transform.SetParent(transform, worldPositionStays: false);
					_instancedModels[(int)attachmentType] = _model;
				} else {
					_model = _instancedModels[(int)attachmentType];
					if (_model != null) {
						_model.SetActive(true);
					}
				}
			}
		}
	}
}