# App da Bibi 🚗💜

Controle dos dias em que a Bibi foi levada para a aula particular, do valor a receber, dos pagamentos e dos gastos com o carro. Com ele você sabe **se está dando lucro**.

- **Admin (você):** registra os dias, os pagamentos e os gastos, ajusta os valores e vê o resumo de lucro.
- **Responsável (tia):** vê só os dias, quantos percursos foram feitos, o valor de cada dia, os pagamentos e o saldo. Não vê gastos nem lucro.

Tudo é gratuito: o site fica no **GitHub Pages** e os dados e logins ficam no **Supabase** (plano free).

---

## Como funciona

| Tela | O que faz |
|---|---|
| **Dias** | Botão “Levei hoje”, lista de dias de aula esquecidos (“sem registro”), calendário do mês, total do mês e botão “Copiar resumo” para mandar no WhatsApp. |
| **Pagamentos** | Saldo geral (total dos dias − total pago) e a lista de pagamentos recebidos. |
| **Gastos** | Manutenção, lavagem, estacionamento… O combustível é calculado sozinho pelos km de cada dia. |
| **Resumo** | Receita − combustível − gastos = lucro (por mês, ano ou tudo), lucro por hora, custo por km e um gráfico dos últimos 6 meses. |
| **Ajustes** | Valor por percurso, km e tempo do trajeto, consumo do carro, preço do combustível e dias de aula (padrão: seg, ter, qua, sex). |

**Percurso** = cada trajeto de carro. Ida e volta no mesmo dia = 2 percursos.
O custo de combustível de cada dia é guardado com o preço daquele dia, então mudar o preço depois não altera o passado.

---

## Colocar no ar (uma vez só, ~10 minutos)

### 1. Criar o banco no Supabase
1. Crie uma conta grátis em <https://supabase.com> e clique em **New project**.
   Nome: `app-da-bibi`. Região: **South America (São Paulo)**. Crie uma senha do banco e guarde.
2. No menu da esquerda, abra **SQL Editor**, cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.

### 2. Bloquear cadastros de estranhos
**Authentication → Sign In / Providers →** desligue **“Allow new users to sign up”** e salve.
(Mesmo que alguém se cadastre, o usuário nasce como `pendente` e não vê nada.)

### 3. Criar os dois usuários
**Authentication → Users → Add user → Create new user**
- Seu e-mail e uma senha, marcando **Auto Confirm User**.
- O e-mail da tia e uma senha para ela, também com **Auto Confirm User**.

Depois, no **SQL Editor**, defina quem é quem (troque os e-mails e nomes):

```sql
update public.perfis set papel = 'admin',       nome = 'Seu nome' where email = 'seu-email@exemplo.com';
update public.perfis set papel = 'responsavel', nome = 'Tia'      where email = 'email-da-tia@exemplo.com';
```

### 4. Ligar o site ao banco
1. No Supabase: **Project Settings → API** (ou **API Keys**). Copie a **Project URL** e a chave **anon / public**.
2. No GitHub, abra o arquivo [`config.js`](config.js), clique no lápis ✏️ e cole os dois valores entre as aspas:
   ```js
   export const SUPABASE_URL = 'https://xxxx.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJ...';
   ```
3. Clique em **Commit changes**. Em 1 a 2 minutos o site atualiza.

> A chave `anon` foi feita para ficar no site, ela é pública. Quem protege os dados são as regras de acesso do `schema.sql`. **Nunca** coloque a chave `service_role` aqui.

### 5. Usar
Abra o endereço do site (aparece em **Settings → Pages** do repositório), entre com seu usuário e mande o link e a senha para a tia.
No celular, use **“Adicionar à tela de início”** para abrir como aplicativo.

Enquanto o `config.js` estiver vazio, o site abre em **modo demonstração**, com dados de exemplo guardados só no navegador. Entre como `admin@demo` ou `tia@demo`, com qualquer senha.

---

## Lembrete diário por e-mail (15:15)

Todo dia, às 15:15 (horário de Brasília), o GitHub confere no app se o dia de aula de hoje já tem registro. **Só se faltar** ele manda um e-mail para o seu Gmail, com um botão para abrir o app. Também avisa se algum dia de aula anterior ficou sem registro.

Para ligar:
1. **Supabase → SQL Editor:** cole [`supabase/lembrete.sql`](supabase/lembrete.sql) e clique em **Run**.
2. **Senha de app do Google:** em <https://myaccount.google.com/apppasswords> (exige a verificação em duas etapas ligada), crie uma senha com o nome `App da Bibi` e copie as 16 letras.
3. **Segredos no GitHub:** no repositório, vá em **Settings → Secrets and variables → Actions → New repository secret** e crie:
   - `GMAIL_USER` → seu endereço do Gmail
   - `GMAIL_APP_PASSWORD` → as 16 letras da senha de app
   - `LEMBRETE_PARA` (opcional) → outro e-mail para receber o lembrete
4. **Testar:** na aba **Actions → Lembrete diário → Run workflow**, deixe “Mandar um e-mail de teste” marcado e clique em **Run workflow**. Em ~1 minuto deve chegar o e-mail de teste.

Os segredos ficam guardados no GitHub e não aparecem no código, então o seu e-mail não fica público. O GitHub pode atrasar o horário em alguns minutos.

---

## As 10 heurísticas de Nielsen no app

1. **Visibilidade do estado do sistema:** indicador “Salvo / Salvando… / Não salvo” no topo, botões mostram “Salvando…”, avisos confirmam cada ação, o dia de hoje fica destacado e há um aviso quando a internet cai.
2. **Correspondência com o mundo real:** português do dia a dia (“Levei”, “percurso”, “Falta pagar”), calendário, valores em R$ e datas por extenso.
3. **Controle e liberdade:** **Desfazer** depois de salvar ou excluir, Cancelar e ✕ em todo diálogo, tecla Esc e qualquer dia pode ser corrigido.
4. **Consistência e padrões:** mesmas cores (verde = levei, amarelo = falta registrar), o mesmo formato de diálogo e o botão principal sempre à direita.
5. **Prevenção de erros:** não deixa registrar o mesmo dia duas vezes nem marcar “Levei” num dia futuro, valida valores negativos e a lista de “dias sem registro” evita esquecimentos.
6. **Reconhecer em vez de lembrar:** os dias de aula aparecem marcados no calendário, os campos já vêm preenchidos com os valores padrão e o saldo em aberto é sugerido no pagamento.
7. **Flexibilidade e eficiência:** “Levei hoje” com 1 toque, “Marcar todos como levei”, “Copiar resumo” para o WhatsApp e “Outro valor…” para os casos diferentes.
8. **Estética e design minimalista:** cada tela mostra só o necessário. A tia vê apenas 2 abas.
9. **Ajudar a reconhecer e corrigir erros:** mensagens em português que dizem o que fazer (ex.: “Esse dia já está registrado. Abra o dia no calendário para editar.”).
10. **Ajuda e documentação:** botão **?** com perguntas frequentes diferentes para admin e responsável, e dicas embaixo dos campos.

---

## Estrutura

```
index.html            página única do app
css/styles.css        visual (modo claro e escuro automáticos)
js/app.js             telas e regras
js/api.js             conexão com o Supabase (ou modo demonstração)
config.js             URL e chave pública do Supabase
supabase/schema.sql   tabelas e regras de acesso
```

Para rodar no computador: `python3 -m http.server 8000` dentro da pasta e abra <http://localhost:8000>.
