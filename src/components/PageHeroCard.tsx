import React from "react";
import { Text, View } from "react-native";

import { styles } from "../theme/styles";

type HeroTone = "cyan" | "violet" | "pink" | "slate";

type HeroStat = {
  label: string;
  value: string;
};

type PageHeroCardProps = {
  eyebrow: string;
  title: string;
  summary: string;
  tone?: HeroTone;
  stats?: HeroStat[];
};

function toneStyle(tone: HeroTone) {
  switch (tone) {
    case "cyan":
      return styles.screenHeroToneCyan;
    case "violet":
      return styles.screenHeroToneViolet;
    case "pink":
      return styles.screenHeroTonePink;
    default:
      return styles.screenHeroToneSlate;
  }
}

export function PageHeroCard({
  eyebrow,
  title,
  summary,
  tone = "slate",
  stats = [],
}: PageHeroCardProps) {
  return (
    <View style={[styles.screenHeroCard, toneStyle(tone)]}>
      <View style={styles.screenHeroGlowA} />
      <View style={styles.screenHeroGlowB} />
      <Text style={styles.screenHeroEyebrow}>{eyebrow}</Text>
      <Text style={styles.screenHeroTitle}>{title}</Text>
      <Text style={styles.screenHeroSummary}>{summary}</Text>
      {stats.length > 0 ? (
        <View style={styles.screenHeroMetaRow}>
          {stats.map((stat) => (
            <View key={`${stat.label}-${stat.value}`} style={styles.screenHeroMetaCard}>
              <Text style={styles.screenHeroMetaLabel}>{stat.label}</Text>
              <Text style={styles.screenHeroMetaValue}>{stat.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
