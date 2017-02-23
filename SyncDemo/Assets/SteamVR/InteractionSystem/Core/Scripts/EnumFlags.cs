// Hololens compatibility:
#if (UNITY_STANDALONE_WIN && !UNITY_EDITOR) && !UNITY_WSA_10_0
//======= Copyright (c) Valve Corporation, All rights reserved. ===============
//
// Purpose: Allows Enums to be shown in the inspector as flags
//
//=============================================================================

using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

namespace Valve.VR.InteractionSystem
{
	//-------------------------------------------------------------------------
	public class EnumFlags : PropertyAttribute
	{
		public EnumFlags() { }
	}


#if UNITY_EDITOR
	//-------------------------------------------------------------------------
	[CustomPropertyDrawer( typeof( EnumFlags ) )]
	public class EnumFlagsPropertyDrawer : PropertyDrawer
	{
		public override void OnGUI( Rect position, SerializedProperty property, GUIContent label )
		{
			property.intValue = EditorGUI.MaskField( position, label, property.intValue, property.enumNames );
		}
	}
#endif
}

#endif
