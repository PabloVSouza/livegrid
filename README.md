<p align="center">
  <img src="./public/livegrid-logo.svg" alt="LiveGrid" width="420" />
</p>

<h1 align="center">LiveGrid by Pablo Souza</h1>

<p align="center">
  Monitoramento multi-stream com layout dinâmico para YouTube, Twitch e Kick.
</p>

---

## Sobre

**LiveGrid** é um agregador de livestreams focado em acompanhar vários criadores ao mesmo tempo, com visual estilo CCTV e controle de layout em tempo real.

O projeto foi pensado para cenários como viagens em grupo, collabs e eventos com múltiplos canais transmitindo simultaneamente.

## Principais recursos

- Grid dinâmico com drag/resize de janelas.
- Ajuste automático para manter tudo visível na viewport.
- Layout salvo por projeto, com separação mobile/desktop.
- Suporte a múltiplas plataformas por streamer:
  - YouTube
  - Twitch
  - Kick
- Troca de fonte (plataforma) na mesma box quando houver mais de uma disponível.
- Presets internos (projetos em destaque).
- Compartilhamento de projeto por URL (query param) + QR Code.
- Importação de projeto compartilhado com um clique.
- i18n com múltiplos idiomas e detecção de idioma do navegador.
- Modal de About e fluxo de Welcome/Home.

## Stack

- **Next.js 16** (App Router)
- **React 19**
- **TypeScript**
- **Tailwind CSS 4**
- **shadcn/ui + Radix UI**
- **Lucide Icons**
- **React Grid Layout**
- **TanStack Query**

## Estrutura de pastas

```txt
app/                  # rotas, layout, APIs server-side
components/           # componentes da interface
components/ui/        # componentes base (shadcn/ui)
data/                 # presets e dados estáticos
lib/                  # lógica compartilhada (domínio, rede, grid engine)
public/               # assets estáticos (logo, ícones, imagens)
```

## Aliases de import

Configurados no `tsconfig.json`:

- `@app/*`
- `@components/*`
- `@ui/*`
- `@data/*`
- `@lib/*`
- `@/*`

## Como rodar localmente

### 1. Instalar dependências

```bash
npm install
```

### 2. Executar em desenvolvimento

```bash
npm run dev
```

### 3. Build de produção

```bash
npm run build
npm start
```

### 4. Lint

```bash
npm run lint
```

## Deploy

O projeto é compatível com **Vercel**.

- Deploy recomendado: conectar o repositório e usar o fluxo padrão do Next.js.
- Domínio de produção planejado: `livegrid.pablosouza.dev`.

## Como funciona o status de live

- O app usa rotas API internas em `app/api/*` para consultar status por plataforma.
- Em vez de depender de chave da YouTube Data API para tudo, o fluxo prioriza resolução e checagens via endpoints server-side do próprio app.
- O front atualiza status em lote com intervalo configurado (`REFRESH_INTERVAL_MS`).

## Projetos e presets

- O usuário pode criar projetos vazios ou importar presets.
- Cada projeto armazena:
  - nome
  - canais/fontes
  - layout
- Presets compartilháveis podem ser abertos por query param (`preset=...`) e importados para a lista local.

## Internacionalização (i18n)

Idiomas suportados:

- English
- Português (Brasil)
- Español
- Français
- العربية
- Русский
- हिन्दी
- বাংলা
- اردو
- 简体中文

O idioma inicial é detectado pelo navegador e pode ser alterado pela UI.

## UX e comportamento de layout

- Grid com snapping e restrições de viewport.
- Em mobile:
  - foco em 1 coluna
  - scroll para conteúdo completo
  - comportamento otimizado para toque.
- Durante interações de drag/resize, há placeholders para reduzir interferência dos players.

## Roadmap sugerido

- Telemetria de falhas por plataforma no live-check.
- Melhorias na robustez de detecção de live em produção (datacenter/consent gate).
- Testes automatizados para regras de layout.
- E2E para fluxos críticos (import preset, share link, troca de fonte).

## Créditos

Desenvolvido por **Pablo Souza**.

---

Se quiser contribuir, abra uma issue com contexto, passos para reproduzir e comportamento esperado.
