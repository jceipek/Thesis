namespace Giverspace
{
using UnityEngine;
class GizmoVisualizer : MonoBehaviour {
   [SerializeField] Material[] _sharedMaterialForGizmoSlot;
   [SerializeField] Transform _visualRoot;
   const int GIZMO_SLOTS = 6;
   Material[] _materialForGizmoSlot = new Material[GIZMO_SLOTS];
   Color32[] _colorsForMaterials = new Color32[GIZMO_SLOTS];

   void Awake () {
       for (int i = 0; i < GIZMO_SLOTS; i++) {
           _colorsForMaterials[i] = _sharedMaterialForGizmoSlot[i].color;
       }
       for (int i = 0; i < _visualRoot.childCount; i++) {
            MeshRenderer meshRenderer = _visualRoot.GetChild(i).GetComponent<MeshRenderer>();
            for (int j = 0; j < GIZMO_SLOTS; j++) {
                if (_sharedMaterialForGizmoSlot[j] == meshRenderer.sharedMaterial) {
                    if (_materialForGizmoSlot[j] == null) {
                        _materialForGizmoSlot[j] = new Material(_sharedMaterialForGizmoSlot[j]);
                    }
                    meshRenderer.material = _materialForGizmoSlot[j];
                    break;
                }
            }
       }
   }

   const byte INACTIVE = 0x33;
   const byte ACTIVE = 0xDD;
   public void UpdateFromData (GizmoVisualsFlags gizmoData) {
       _visualRoot.gameObject.SetActive(gizmoData != GizmoVisualsFlags.None);
       for (int i = 0; i < GIZMO_SLOTS; i++) {
           _colorsForMaterials[i].a = (((byte)gizmoData & (1<<i)) == (1<<i))? ACTIVE : INACTIVE;
           _materialForGizmoSlot[i].color = _colorsForMaterials[i];         
       }
   }
}

}