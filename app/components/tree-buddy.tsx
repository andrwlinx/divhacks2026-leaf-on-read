import { colors, type Mood } from "@/constants/design"
import Svg, { Circle, Ellipse, Path, Rect, Text as SvgText } from "react-native-svg"

const canopy: Record<Mood, { base: string; light: string }> = {
  happy: { base: "#4CB872", light: "#74D394" },
  thirsty: { base: "#B9C45C", light: "#D3DB85" },
  sleepy: { base: "#8FB39A", light: "#AFCAB7" },
}

// The mascot: a round little street tree whose face shows how it's doing.
export function TreeBuddy({ mood = "happy", size = 96 }: { mood?: Mood; size?: number }) {
  const tone = canopy[mood]
  const ink = colors.ink
  return (
    <Svg width={size} height={size * 1.1} viewBox="0 0 100 110">
      <Ellipse cx={50} cy={101} rx={28} ry={5} fill="rgba(31,58,43,0.10)" />
      <Rect x={43} y={70} width={14} height={30} rx={6} fill={colors.soil} />
      <Circle cx={28} cy={50} r={21} fill={tone.base} />
      <Circle cx={72} cy={50} r={21} fill={tone.base} />
      <Circle cx={50} cy={32} r={26} fill={tone.base} />
      <Circle cx={50} cy={56} r={27} fill={tone.base} />
      <Circle cx={40} cy={22} r={8} fill={tone.light} opacity={0.8} />

      {mood === "happy" ? (
        <>
          <Circle cx={41} cy={50} r={3.4} fill={ink} />
          <Circle cx={59} cy={50} r={3.4} fill={ink} />
          <Circle cx={42.2} cy={48.8} r={1.1} fill="#fff" />
          <Circle cx={60.2} cy={48.8} r={1.1} fill="#fff" />
          <Path d="M44 58 Q50 64.5 56 58" stroke={ink} strokeWidth={2.6} fill="none" strokeLinecap="round" />
          <Circle cx={34} cy={57} r={4.2} fill={colors.blush} opacity={0.65} />
          <Circle cx={66} cy={57} r={4.2} fill={colors.blush} opacity={0.65} />
        </>
      ) : null}

      {mood === "thirsty" ? (
        <>
          <Path d="M36 45 L45 47.5" stroke={ink} strokeWidth={2.2} strokeLinecap="round" />
          <Path d="M64 45 L55 47.5" stroke={ink} strokeWidth={2.2} strokeLinecap="round" />
          <Circle cx={41} cy={52} r={3} fill={ink} />
          <Circle cx={59} cy={52} r={3} fill={ink} />
          <Path
            d="M43 61 Q46.5 58 50 61 Q53.5 64 57 61"
            stroke={ink}
            strokeWidth={2.4}
            fill="none"
            strokeLinecap="round"
          />
          <Path d="M76 24 C76 24 70.5 31.5 70.5 35 A5.5 5.5 0 0 0 81.5 35 C81.5 31.5 76 24 76 24 Z" fill={colors.water} />
        </>
      ) : null}

      {mood === "sleepy" ? (
        <>
          <Path d="M37 50 Q41 53.5 45 50" stroke={ink} strokeWidth={2.4} fill="none" strokeLinecap="round" />
          <Path d="M55 50 Q59 53.5 63 50" stroke={ink} strokeWidth={2.4} fill="none" strokeLinecap="round" />
          <Path d="M47 59 Q50 61.5 53 59" stroke={ink} strokeWidth={2.2} fill="none" strokeLinecap="round" />
          <SvgText x={72} y={26} fontSize={13} fontWeight="700" fill={ink} opacity={0.5}>
            z
          </SvgText>
          <SvgText x={80} y={16} fontSize={9} fontWeight="700" fill={ink} opacity={0.35}>
            z
          </SvgText>
        </>
      ) : null}
    </Svg>
  )
}
