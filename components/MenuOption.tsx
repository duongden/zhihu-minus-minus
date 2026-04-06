import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text, View } from './Themed';
import { useColorScheme } from './useColorScheme';
import Colors from '@/constants/Colors';

interface MenuOptionProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  color?: string;
}

export function MenuOption({ icon, label, onPress, color }: MenuOptionProps) {
  const colorScheme = useColorScheme();
  const textColor = Colors[colorScheme].text;

  return (
    <Pressable
      className="flex-row items-center py-[15px] px-2.5"
      onPress={onPress}
    >
      <View className="w-10 h-10 rounded-[20px] bg-[rgba(150,150,150,0.08)] justify-center items-center mr-[15px]">
        <Ionicons name={icon} size={26} color={color || textColor} />
      </View>
      <Text className="text-base font-medium" style={{ color: textColor }}>
        {label}
      </Text>
    </Pressable>
  );
}
