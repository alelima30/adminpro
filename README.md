# AdminPro · Portal de Gestão

Sistema completo de **gestão para condomínios** — finanças, reservas, manutenção, comunicados e cadastros. Aplicativo web instalável (**PWA**), feito em HTML/CSS/JS puro com backend **Firebase**.

![PWA](https://img.shields.io/badge/PWA-instal%C3%A1vel-E87722) ![Firebase](https://img.shields.io/badge/Firebase-Firestore%20%7C%20Auth%20%7C%20Storage-FFCA28)

---

## ✨ Funcionalidades

- **Dashboard** com indicadores e gráficos
- **Administrativo → Cadastro**
  - Cadastro de Unidades (endereço + vínculo Proprietário/Morador)
  - Localizações (ruas, alamedas, avenidas…)
  - Classificação de Condôminos
- **Condôminos** — dados pessoais, foto, dependentes (com foto, CPF, RG, parentesco) e pesquisa avançada (nome, CPF, RG, unidade) com busca sem acento
- **Operações** — manutenção, preventivas, comunicados, eventos, reservas, regulamentos
- **Sistema** — usuários, configurações, administração de fotos
- **Tema claro/escuro** e identidade visual AdminPro

## 📲 Instalar como aplicativo

O portal é um **PWA** — pode ser instalado no celular ou computador:

- **Android (Chrome):** abra o site → menu **⋮** → *Instalar app* (ou botão laranja **Instalar app**)
- **iPhone/iPad (Safari):** botão **Compartilhar** → *Adicionar à Tela de Início*
- **PC (Chrome/Edge):** ícone de instalar na barra de endereço

> Para a instalação e o modo offline funcionarem, o site precisa estar hospedado em **https://** com o `sw.js` na mesma pasta.

## 🗂 Arquivos

| Arquivo | Descrição |
|---|---|
| `adminpro.html` | Aplicativo completo (autossuficiente, com manifest e ícones embutidos) |
| `index.html` | Abre o app automaticamente (atalho da raiz) |
| `sw.js` | Service worker — modo offline e instalação |
| `manifest.webmanifest` | Manifest alternativo (opcional, o app já tem um embutido) |
| `icon-192.png` / `icon-512.png` | Ícones do app (opcionais) |

## 🚀 Hospedagem

Funciona em qualquer host estático com HTTPS (Firebase Hosting, GitHub Pages, Vercel, Netlify…).
Basta servir os arquivos na mesma pasta. A raiz (`index.html`) redireciona para `adminpro.html`.

---

© AdminPro — Gestão Inteligente para Condomínios.
