export interface PresetDefinition {
  id: string
  name: string
  description: string
  image: string
  channels: string[]
}

export const LIVEGRID_PRESETS: PresetDefinition[] = [
  {
    id: 'viagem-transamazonica',
    name: 'Viagem na Transamazônica',
    description:
      'Viagem pela rodovia Transamazônica, organizada por Ricardinho ACF, com vários canais transmitindo ao vivo durante a jornada.',
    image: '/presets/transamazonica.jpg',
    channels: [
      '@acfperformance',
      '@ratoborrachudo',
      '@Tonimek',
      '@livesdogordox',
      '@INVERNONATRANSAMAZÔNICA',
      '@renatocariani',
      '@RichardRasmussenSelvagem'
    ]
  }
]
