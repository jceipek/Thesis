// Hololens compatibility:
#if (UNITY_STANDALONE_WIN && !UNITY_EDITOR) && !UNITY_WSA_10_0
//======= Copyright (c) Valve Corporation, All rights reserved. ===============
//
// Purpose: Allows the teleport arc trace to pass through any colliders on this
//			object
//
//=============================================================================

using UnityEngine;
using System.Collections;

namespace Valve.VR.InteractionSystem
{
	//-------------------------------------------------------------------------
	public class IgnoreTeleportTrace : MonoBehaviour
	{
	}
}

#endif
