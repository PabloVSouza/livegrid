export interface PresetDefinition {
  id: string
  name: string
  description: string
  image: string
  channels?: string[]
  entries?: Array<{
    title?: string
    sources: string[]
  }>
}

export const LIVEGRID_PRESETS: PresetDefinition[] = [
  {
    id: 'viagem-transamazonica',
    name: 'Viagem na Transamazônica',
    description:
      'Viagem pela rodovia Transamazônica, organizada por Ricardinho ACF, com vários canais transmitindo ao vivo durante a jornada.',
    image: '/presets/transamazonica.jpg',
    entries: [
      { title: 'ACF', sources: ['@acfperformance'] },
      { title: 'Rato Borrachudo', sources: ['@ratoborrachudo', 'kick:ratoborrachudokick'] },
      { title: 'Tonimek', sources: ['@Tonimek'] },
      { title: 'Lives do gORDOx [OFICIAL]', sources: ['@livesdogordox'] },
      { title: 'INVERNO NA TRANSAMAZÔNICA', sources: ['@INVERNONATRANSAMAZÔNICA'] },
      { title: 'Renato Cariani', sources: ['@renatocariani'] },
      { title: 'Richard Rasmussen', sources: ['@RichardRasmussenSelvagem'] }
    ]
  }
]
