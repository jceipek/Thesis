using UnityEngine;

public class DebugVolume : MonoBehaviour {

	[SerializeField] float _radius = 0.1f;
	void OnDrawGizmos () {
		Gizmos.DrawWireSphere(transform.position, _radius);
	}

}
