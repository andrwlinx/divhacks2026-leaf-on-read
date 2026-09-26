import { SymbolView, type SymbolViewProps, type SymbolWeight } from "expo-symbols"
import type { StyleProp, ViewStyle } from "react-native"

// SF Symbols only: the app targets iPhone in Expo Go.
export function Icon({
  name,
  size = 20,
  color,
  weight = "semibold",
  style,
}: {
  name: SymbolViewProps["name"]
  size?: number
  color: string
  weight?: SymbolWeight
  style?: StyleProp<ViewStyle>
}) {
  return (
    <SymbolView
      name={name}
      tintColor={color}
      weight={weight}
      resizeMode="scaleAspectFit"
      style={[{ width: size, height: size }, style]}
    />
  )
}
