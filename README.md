# rl-coach: coach de mecânicas de Rocket League

Um agente para o **Claude Code** que funciona como coach de Rocket League.

- **Treino de mecânica:** você grava 20 tentativas de uma mecânica no custom training e manda o vídeo. O coach analisa quadro a quadro: botões do controle (A, B, RB, LB, analógico), tempos e acertos na barra COMPLETION. Ele devolve o placar, prints comentados e 1 ou 2 correções para a próxima rodada.
- **Partidas:** lê replays (`.replay`) para ver posicionamento, boost e como saíram os gols.
- **O que treinar:** sugere o próximo treino **por modo (1v1, 2v2 ou 3v3)**, a partir do seu rank, dos seus replays e do histórico das mecânicas.

O progresso fica salvo em arquivos locais, e cada mecânica tem o seu.

## Requisitos
- **Claude Code**
- **ffmpeg e ffprobe** no PATH (por exemplo pelo Git Bash)
- **Node.js**
- **BakkesMod** com o plugin **ControllerOverlay** (o normal, não o "Pro"), instalado pelo bakkesplugins.com ou pelo Plugin Manager do jogo (F2)
- Opcional, para replays: **rrrocket** (github.com/nickbabcock/rrrocket). O coach pede permissão antes de baixar.

## Como começar
1. Clone o repositório e abra o Claude Code na pasta.
2. Na primeira sessão, o coach cria o seu `perfil.md` a partir do `perfil.exemplo.md`, com nick, rank em cada modo, objetivo, controles e pastas.
3. Diga qual mecânica quer treinar ("quero treinar flip reset") ou pergunte **"o que eu treino?"**.
4. Combine com o coach o critério de acerto, o custom training e as etapas da jogada.
5. Grave uma rodada de 20 tentativas com o overlay ligado e mande o caminho do `.mp4`.

Use **uma conversa por mecânica**.

**Resolução:** as coordenadas do scanner são para **2560x1440 a 60 fps**. Se você grava em outra resolução, peça ao coach para recalcular antes da primeira análise.

## Packs de custom training
| Pack | Código | Como a bola vem | Mecânicas |
|---|---|---|---|
| Intense Flick | `B023-AD79-5D60-1753` | bola começa parada no teto | 45° flick, classy flick |
| Intense Wall Drag | `09CA-5C02-816C-1833` | bola subindo a parede | wall drag |

**Regra:** cada rodada usa um pack com **20 lances iguais**, ou seja, o mesmo lance repetido. Assim a barra COMPLETION conta os acertos sozinha.

## Estrutura
| Arquivo | Versionado? | O que é |
|---|---|---|
| `CLAUDE.md` | sim | instruções do coach |
| `tools/` | sim | scripts Node: `scan.js` (barra + A/B), `overlay.js` (A, B, RB, LB e analógico), `flick.js`, `boost-after-jump.js`, `replay-*.js` |
| `perfil.exemplo.md` | sim | modelo do perfil do jogador |
| `mecanicas/_modelo.md` | sim | modelo de cada mecânica |
| `perfil.md` | não (pessoal) | o seu perfil (rank, nick, pastas) |
| `plano.md` | não (pessoal) | histórico das sugestões de treino |
| `mecanicas/*.md` | não (pessoal) | o seu histórico em cada mecânica |
| `fotos/` | não (pessoal) | prints das rodadas |

O `.gitignore` usa padrões: qualquer mecânica nova, foto, vídeo ou replay fica fora do git automaticamente.
