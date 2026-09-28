# Moletas

Aplicação React de planejamento pessoal para múltiplos usuários. Cada pessoa possui uma conta própria e enxerga apenas a própria agenda, tarefas, estudos, rotina, treinos e preferências de alertas.

## O que está incluído

- Autenticação com e-mail e senha via Supabase Auth.
- Dados isolados por pessoa com Row Level Security (RLS).
- Agenda e compromissos com lembretes configuráveis.
- Tarefas, prioridades, conclusão de pendências e cronômetros de foco.
- Notas rápidas fixáveis para ideias, referências e decisões.
- Estudos por matéria, meta semanal e registro de sessões.
- Trilhas de estudo contínuas com tópicos, anotações, links, certificados, imagens e progresso.
- Hábitos, rotina e progresso diário.
- Planos de treino organizados por dia e grupo muscular, com histórico de sessões.
- Tema claro/escuro persistente e interface adaptada para celular.
- E-mail (Resend) e SMS/WhatsApp (Twilio) preparados em uma função de servidor da Vercel.

## Desenvolvimento local

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Copie `.env.example` para `.env.local` e preencha as duas variáveis `VITE_SUPABASE_*`.

3. Inicie o app:

   ```bash
   npm run dev
   ```

Sem `.env.local`, a tela de acesso informa que a conexão com o Supabase é necessária. Não há modo de demonstração nem dados fictícios pré-carregados.

## Configuração do Supabase

1. Crie um projeto no Supabase.
2. No **SQL Editor**, execute [a migration inicial](supabase/migrations/20260922_moletas_schema.sql). Se ela já foi executada, rode também [a migration dos cronômetros](supabase/migrations/20260923_task_timers.sql), [a migration de trilhas e treinos](supabase/migrations/20260927_learning_paths_and_workout_groups.sql), [a migration de notas](supabase/migrations/20260928_notes_and_crud.sql) e [a migration de materiais e MFA](supabase/migrations/20260929_study_files_and_mfa.sql).
3. Em **Authentication → URL Configuration**, informe a URL de produção da Vercel como _Site URL_ e em _Redirect URLs_.
4. Em **Authentication**, mantenha a confirmação de e-mail ativada e configure um SMTP próprio antes de abrir o cadastro ao público.
5. Copie a URL e a **Publishable key** para `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.

### MFA e materiais privados

Após entrar, abra **Conta** para alterar a senha e configurar MFA por aplicativo autenticador (TOTP). Quando ativado, a conta passa a exigir o segundo fator no login e as políticas do banco restringem os dados privados a sessões AAL2.

Os certificados e imagens das matérias são enviados ao bucket privado `study-files`, criado pela migration. Ele aceita PDF, JPG, PNG e WEBP de até 10 MB e entrega arquivos apenas por URL temporária assinada para o próprio usuário.

> A publishable key é a única chave que pode chegar ao navegador; as políticas RLS da migration limitam cada consulta ao `auth.uid()` do usuário autenticado. A chave `SUPABASE_SECRET_KEY` nunca deve usar o prefixo `VITE_` nem ser adicionada ao Git.

## Configuração da Vercel

1. Envie este repositório para o GitHub e importe-o na Vercel, ou use a CLI da Vercel.
2. Configure as variáveis de ambiente listadas em `.env.example`:
   - `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` para o build;
   - `SUPABASE_URL`, `SUPABASE_SECRET_KEY` e `CRON_SECRET` apenas no servidor;
   - `RESEND_API_KEY` e `EMAIL_FROM` para e-mail;
   - `TWILIO_*` para SMS/WhatsApp.
3. Faça o deploy. A configuração já executa `npm run build` e publica `dist/`.

## Lembretes por e-mail e SMS

`api/send-reminders.js` é uma função de servidor protegida por `CRON_SECRET`. Ela encontra lembretes próximos, reserva cada envio em `notification_logs` e chama Resend/Twilio somente quando o usuário ativou o canal correspondente. A reserva tem uma chave única para evitar duplicidades em novas execuções do cron.

O arquivo `vercel.json` programa a função a cada cinco minutos. Essa frequência requer Vercel Pro ou superior. No plano Hobby, crons só podem executar uma vez por dia e não têm precisão de minutos; para alertas exatos, use Vercel Pro ou substitua o agendador por um serviço externo.

## Segurança aplicada no projeto

- RLS, políticas por usuário, FKs, limites e validações no banco.
- Revogação explícita de acesso do papel anônimo às tabelas privadas.
- Chave administrativa do Supabase isolada no servidor; ela nunca integra o bundle React.
- MFA TOTP configurável na área da conta, com desafio no login e políticas RLS que exigem AAL2 após a ativação.
- Materiais de estudo em bucket privado, com política por usuário, formatos restritos e URLs assinadas de curta duração.
- Cabeçalhos de segurança: CSP, HSTS, proteção contra iframe, MIME sniffing, referrer policy, permissions policy e `noindex`.
- Função de cron autenticada e entrega de alertas idempotente.
- Segredos e arquivos de ambiente ignorados pelo Git.

Antes de lançar, habilite CAPTCHA, configure limites de autenticação e uma política de senha forte/proteção contra senhas vazadas. Revise também o **Security Advisor** do Supabase após aplicar as migrations.
