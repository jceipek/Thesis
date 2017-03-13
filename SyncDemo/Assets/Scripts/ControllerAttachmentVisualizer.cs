namespace Giverspace {
	using UnityEngine;

	public class ControllerAttachmentVisualizer : MonoBehaviour {
		[SerializeField] ControllerAttachmentsToPrefabs _attachmentsToPrefabs;

		static GameObject[] _prefabsForModels;
		GameObject[] _instancedModels;
		GameObject _model;
		ControllerAttachmentType _controllerAttachment = ControllerAttachmentType.None;

		bool _initialized = false;
		void Init () {
			int maxIndex = _attachmentsToPrefabs.HighestAttachmentIndex;
			_prefabsForModels = new GameObject[maxIndex+1];
			_instancedModels = new GameObject[maxIndex+1];

			for (int i = 0; i < (int)ControllerAttachmentType.length; i++) {
				_prefabsForModels[i] = _attachmentsToPrefabs.PrefabForAttachmentType((ControllerAttachmentType)i);
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