"""Lembrete diário do App da Bibi.

Pergunta ao Supabase se o dia de hoje (ou algum dia de aula recente) está sem
registro e, se estiver, manda um e-mail pelo Gmail.

Variáveis de ambiente (segredos do GitHub):
  GMAIL_USER          seu endereço do Gmail (remetente)
  GMAIL_APP_PASSWORD  "senha de app" de 16 letras criada no Google
  LEMBRETE_PARA       (opcional) quem recebe; padrão = GMAIL_USER
  FORCAR=1            (opcional) manda o e-mail mesmo sem pendência, para teste
"""
import json
import os
import re
import smtplib
import sys
import urllib.request
from email.message import EmailMessage
from pathlib import Path

APP_URL = "https://papacosta.github.io/app-da-bibi/"
SEMANA = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]


def ler_config():
    texto = (Path(__file__).resolve().parent.parent / "config.js").read_text(encoding="utf-8")
    url = re.search(r"SUPABASE_URL\s*=\s*'([^']*)'", texto).group(1)
    chave = re.search(r"SUPABASE_ANON_KEY\s*=\s*'([^']*)'", texto).group(1)
    if not url or not chave:
        sys.exit("config.js sem dados do Supabase.")
    return url, chave


def situacao():
    url, chave = ler_config()
    req = urllib.request.Request(
        f"{url}/rest/v1/rpc/lembrete_hoje",
        data=b"{}",
        method="POST",
        headers={"apikey": chave, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def montar_mensagem(s, forcar):
    from datetime import date

    hoje = date.fromisoformat(s["hoje"])
    nome_dia = SEMANA[hoje.weekday()]
    falta_hoje = s["previsto_hoje"] and not s["registrado_hoje"]
    pend = int(s["pendentes_anteriores"])

    if not falta_hoje and pend == 0 and not forcar:
        return None

    linhas = []
    if falta_hoje:
        assunto = f"App da Bibi: você levou a Bibi hoje ({nome_dia})?"
        linhas.append(f"Hoje, {nome_dia} {hoje:%d/%m}, é dia de aula e ainda não tem registro.")
        linhas.append("Abra o app e toque em “Levei hoje” ou “Não levei”.")
    elif pend:
        assunto = f"App da Bibi: {pend} dia(s) de aula sem registro"
    else:
        assunto = "App da Bibi: teste do lembrete ✅"
        linhas.append("Este é um e-mail de teste. O lembrete diário está funcionando.")
    if pend:
        linhas.append(f"Também há {pend} dia(s) de aula anteriores sem registro (aparecem em amarelo no calendário).")

    msg = EmailMessage()
    msg["Subject"] = assunto
    texto = "\n\n".join(linhas + [f"Abrir o app: {APP_URL}"])
    msg.set_content(texto)
    paragrafos = "".join(f"<p style='margin:0 0 12px'>{l}</p>" for l in linhas)
    msg.add_alternative(f"""\
<div style="font-family:system-ui,Arial,sans-serif;font-size:16px;color:#1f1b2e;max-width:480px">
  <h2 style="color:#6d4bd8;margin:0 0 12px">App da Bibi</h2>
  {paragrafos}
  <p style="margin:20px 0"><a href="{APP_URL}" style="background:#6d4bd8;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Abrir o app</a></p>
  <p style="color:#6b6680;font-size:13px">Lembrete automático. Ele só chega quando falta registrar algum dia.</p>
</div>""", subtype="html")
    return msg


def main():
    forcar = os.environ.get("FORCAR") == "1"
    s = situacao()
    print("Situação:", s)
    msg = montar_mensagem(s, forcar)
    if msg is None:
        print("Nada pendente. Nenhum e-mail enviado.")
        return
    usuario = os.environ["GMAIL_USER"]
    msg["From"] = f"App da Bibi <{usuario}>"
    msg["To"] = os.environ.get("LEMBRETE_PARA") or usuario
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as smtp:
        smtp.login(usuario, os.environ["GMAIL_APP_PASSWORD"].replace(" ", ""))
        smtp.send_message(msg)
    print("E-mail enviado:", msg["Subject"])


if __name__ == "__main__":
    main()
