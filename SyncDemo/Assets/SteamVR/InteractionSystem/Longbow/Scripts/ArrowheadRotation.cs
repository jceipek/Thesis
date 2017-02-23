// Hololens Compatibility:
#if UNITY_STANDALONE_WIN && !UNITY_WSA_10_0
//======= Copyright (c) Valve Corporation, All rights reserved. ===============
//
// Purpose: Sets a random rotation for the arrow head
//
//=============================================================================

using UnityEngine;
using System.Collections;

namespace Valve.VR.InteractionSystem
{
	//-------------------------------------------------------------------------
	public class ArrowheadRotation : MonoBehaviour
	{
		//-------------------------------------------------
		void Start()
		{
			float randX = Random.Range( 0f, 180f );
			transform.localEulerAngles = new Vector3( randX, -90f, 90f );
		}
	}
}

#endif
