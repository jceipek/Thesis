// Hololens Compatibility:
#if UNITY_STANDALONE_WIN && !UNITY_WSA_10_0
//======= Copyright (c) Valve Corporation, All rights reserved. ===============
//
// Purpose: Makes this object ignore any hovering by the hands
//
//=============================================================================

using UnityEngine;

namespace Valve.VR.InteractionSystem
{
	//-------------------------------------------------------------------------
	public class IgnoreHovering : MonoBehaviour
	{
		[Tooltip( "If Hand is not null, only ignore the specified hand" )]
		public Hand onlyIgnoreHand = null;
	}
}

#endif
