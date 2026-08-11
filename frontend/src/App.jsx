import { Fragment, useEffect, useState } from "react";

const API_BASE_URL = "http://127.0.0.1:8000";
const CHAT_URL = `${API_BASE_URL}/chat`;
const CONVERSATIONS_URL = `${API_BASE_URL}/conversations`;
const DOCUMENTS_URL = `${API_BASE_URL}/documents`;
const agentModes = [
  {
    id: "tutor",
    label: "Tutor",
    hint: "Explica e ensina com clareza.",
  },
  {
    id: "reviewer",
    label: "Revisor",
    hint: "Analisa codigo, bugs e melhorias.",
  },
  {
    id: "architecture",
    label: "Arquitetura",
    hint: "Pensa estrutura, camadas e escalabilidade.",
  },
];

const openingMessages = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "Ola. Escolha um modo do agente, envie uma pergunta e use documentos para ativar respostas com contexto.",
    sources: [],
  },
];

function createSessionId() {
  return crypto.randomUUID();
}

function renderInline(text) {
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g).filter(Boolean);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }

    if (
      part.startsWith("*") &&
      part.endsWith("*") &&
      !part.startsWith("**") &&
      !part.endsWith("**") &&
      part.length > 2
    ) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }

    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }

    return <Fragment key={index}>{part}</Fragment>;
  });
}

function renderMessageContent(content) {
  const blocks = content.trim().split(/\n\s*\n/);

  return blocks.map((block, index) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const isList = lines.every(
      (line) => line.startsWith("- ") || line.startsWith("* "),
    );
    const isCodeBlock = block.startsWith("```") && block.endsWith("```");

    if (isCodeBlock) {
      const code = block
        .replace(/^```[a-zA-Z]*\n?/, "")
        .replace(/```$/, "")
        .trim();

      return (
        <pre key={index}>
          <code>{code}</code>
        </pre>
      );
    }

    if (isList) {
      return (
        <ul key={index}>
          {lines.map((line, itemIndex) => (
            <li key={itemIndex}>{renderInline(line.slice(2))}</li>
          ))}
        </ul>
      );
    }

    return <p key={index}>{renderInline(block)}</p>;
  });
}

function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function App() {
  const [messages, setMessages] = useState(openingMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState(() => createSessionId());
  const [sessionTitle, setSessionTitle] = useState("Nova conversa");
  const [conversations, setConversations] = useState([]);
  const [isSidebarLoading, setIsSidebarLoading] = useState(true);
  const [documents, setDocuments] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [agentMode, setAgentMode] = useState("tutor");

  async function loadConversations(preferredSessionId) {
    const response = await fetch(CONVERSATIONS_URL);

    if (!response.ok) {
      throw new Error("Nao foi possivel carregar as conversas.");
    }

    const data = await response.json();
    setConversations(data);

    const selectedConversation = preferredSessionId
      ? data.find((item) => item.session_id === preferredSessionId)
      : null;

    if (selectedConversation) {
      setSessionTitle(selectedConversation.title);
    }

    return data;
  }

  async function loadDocuments() {
    const response = await fetch(DOCUMENTS_URL);

    if (!response.ok) {
      throw new Error("Nao foi possivel carregar os documentos da base RAG.");
    }

    const data = await response.json();
    setDocuments(data);
  }

  async function loadConversation(sessionToLoad) {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`${CONVERSATIONS_URL}/${sessionToLoad}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Nao foi possivel abrir a conversa.");
      }

      const data = await response.json();

      setSessionId(data.session_id);
      setSessionTitle(data.title);
      setMessages(data.messages.map((message) => ({ ...message, sources: [] })));
      setInput("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      try {
        const [conversationData] = await Promise.all([
          loadConversations(),
          loadDocuments(),
        ]);

        if (!isMounted) {
          return;
        }

        if (conversationData.length > 0) {
          const firstConversation = conversationData[0];
          await loadConversation(firstConversation.session_id);
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.message);
        }
      } finally {
        if (isMounted) {
          setIsSidebarLoading(false);
        }
      }
    }

    bootstrap();

    return () => {
      isMounted = false;
    };
  }, []);

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function handleNewConversation() {
    if (isLoading) {
      return;
    }

    setSessionId(createSessionId());
    setSessionTitle("Nova conversa");
    setMessages(openingMessages);
    setInput("");
    setError("");
  }

  function handleFileChange(event) {
    setSelectedFile(event.target.files?.[0] ?? null);
  }

  async function handleDocumentUpload(event) {
    event.preventDefault();

    if (!selectedFile || isUploadingDocument) {
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    setIsUploadingDocument(true);
    setError("");

    try {
      const response = await fetch(DOCUMENTS_URL, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Nao foi possivel enviar o documento.");
      }

      setSelectedFile(null);
      event.currentTarget.reset();
      await loadDocuments();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsUploadingDocument(false);
    }
  }

  async function handleDeleteDocument(documentId) {
    const confirmed = window.confirm(
      "Deseja remover este documento da base RAG?",
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`${DOCUMENTS_URL}/${documentId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Nao foi possivel apagar o documento.");
      }

      await loadDocuments();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleSelectConversation(sessionToLoad) {
    if (isLoading || sessionToLoad === sessionId) {
      return;
    }

    await loadConversation(sessionToLoad);
  }

  async function handleDeleteConversation(event, sessionToDelete) {
    event.stopPropagation();

    if (isLoading) {
      return;
    }

    const confirmed = window.confirm(
      "Deseja apagar esta conversa? Essa acao nao pode ser desfeita.",
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`${CONVERSATIONS_URL}/${sessionToDelete}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Nao foi possivel apagar a conversa.");
      }

      const remainingConversations = conversations.filter(
        (conversation) => conversation.session_id !== sessionToDelete,
      );
      setConversations(remainingConversations);

      if (sessionToDelete === sessionId) {
        if (remainingConversations.length > 0) {
          await loadConversation(remainingConversations[0].session_id);
        } else {
          handleNewConversation();
        }
      }
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const message = input.trim();
    if (!message || isLoading) {
      return;
    }

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      sources: [],
    };

    const currentSessionId = sessionId;
    const nextTitle = sessionTitle === "Nova conversa" ? message : sessionTitle;

    setMessages((current) => [...current, userMessage]);
    setSessionTitle(nextTitle);
    setInput("");
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_id: currentSessionId,
          message,
          agent_mode: agentMode,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.detail || "Nao foi possivel obter a resposta do backend.",
        );
      }

      const data = await response.json();

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.reply,
          sources: data.sources || [],
        },
      ]);

      await loadConversations(currentSessionId);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Agente tecnico com RAG</p>
        <h1>Atelier AI</h1>
        <p className="lede">
          Um agente focado em tecnologia, com modos de atuacao diferentes,
          memoria de conversa e recuperacao de contexto por documentos.
        </p>
      </section>

      <section className="workspace" aria-label="Ambiente do chatbot">
        <aside className="conversation-sidebar" aria-label="Lista de conversas">
          <div className="sidebar-head">
            <p className="sidebar-title">Conversas</p>
            <button
              type="button"
              className="ghost-button sidebar-button"
              onClick={handleNewConversation}
              disabled={isLoading}
            >
              Nova conversa
            </button>
          </div>

          <div className="conversation-list">
            {isSidebarLoading ? <p className="sidebar-empty">Carregando...</p> : null}

            {!isSidebarLoading && conversations.length === 0 ? (
              <p className="sidebar-empty">
                Suas conversas vao aparecer aqui depois da primeira mensagem.
              </p>
            ) : null}

            {conversations.map((conversation) => (
              <article
                key={conversation.session_id}
                className={`conversation-card ${
                  conversation.session_id === sessionId ? "active" : ""
                }`}
              >
                <button
                  type="button"
                  className="conversation-open"
                  onClick={() => handleSelectConversation(conversation.session_id)}
                  disabled={isLoading}
                >
                  <span className="conversation-card-title">{conversation.title}</span>
                  <span className="conversation-card-date">
                    {formatDate(conversation.updated_at)}
                  </span>
                </button>
                <button
                  type="button"
                  className="delete-button"
                  onClick={(event) =>
                    handleDeleteConversation(event, conversation.session_id)
                  }
                  disabled={isLoading}
                  aria-label={`Apagar conversa ${conversation.title}`}
                >
                  Apagar
                </button>
              </article>
            ))}
          </div>

          <section className="rag-panel" aria-label="Base de conhecimento">
            <div className="rag-panel-head">
              <p className="sidebar-title">Base RAG</p>
              <span className="rag-badge">{documents.length} docs</span>
            </div>

            <form className="rag-upload" onSubmit={handleDocumentUpload}>
              <label className="rag-upload-label" htmlFor="rag-file">
                Arquivos de texto UTF-8
              </label>
              <input
                id="rag-file"
                type="file"
                accept=".txt,.md,.py,.js,.ts,.tsx,.jsx,.json,.csv"
                onChange={handleFileChange}
              />
              <button type="submit" disabled={!selectedFile || isUploadingDocument}>
                {isUploadingDocument ? "Enviando" : "Adicionar documento"}
              </button>
            </form>

            <div className="document-list">
              {documents.length === 0 ? (
                <p className="sidebar-empty">
                  Adicione arquivos de texto para o chatbot responder com contexto.
                </p>
              ) : null}

              {documents.map((document) => (
                <article key={document.id} className="document-card">
                  <div>
                    <p className="document-name">{document.name}</p>
                    <p className="document-meta">
                      {document.chunk_count} chunks • {formatDate(document.created_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="delete-button"
                    onClick={() => handleDeleteDocument(document.id)}
                  >
                    Apagar
                  </button>
                </article>
              ))}
            </div>
          </section>
        </aside>

        <section className="chat-frame" aria-label="Conversa com o chatbot">
          <header className="chat-header">
            <div>
              <p className="chat-title">{sessionTitle}</p>
              <p className="chat-subtitle">Agente tecnico com contexto recuperado</p>
            </div>
            <div className="chat-actions">
              <span className={`status ${isLoading ? "busy" : "ready"}`}>
                {isLoading ? "Respondendo" : "Disponivel"}
              </span>
            </div>
          </header>

          <section className="agent-mode-panel" aria-label="Modo do agente">
            <div className="agent-mode-copy">
              <p className="agent-mode-title">Modo do agente</p>
              <p className="agent-mode-text">
                Troque o comportamento do assistente conforme o tipo de ajuda que
                voce quer destacar no portfólio.
              </p>
            </div>

            <div className="agent-mode-list">
              {agentModes.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={`agent-mode-button ${
                    agentMode === mode.id ? "active" : ""
                  }`}
                  onClick={() => setAgentMode(mode.id)}
                  disabled={isLoading}
                >
                  <span>{mode.label}</span>
                  <small>{mode.hint}</small>
                </button>
              ))}
            </div>
          </section>

          <div className="messages">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`message message-${message.role}`}
              >
                <span className="message-role">
                  {message.role === "assistant" ? "Atelier" : "Voce"}
                </span>
                <div className="message-body">
                  {renderMessageContent(message.content)}
                </div>
                {message.role === "assistant" && message.sources?.length ? (
                  <div className="message-sources">
                    <span className="message-sources-label">Fontes</span>
                    <ul>
                      {message.sources.map((source) => (
                        <li key={source}>{source}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </article>
            ))}

            {isLoading ? (
              <article className="message message-assistant pending">
                <span className="message-role">Atelier</span>
                <div className="message-body">
                  <p>Buscando contexto e escrevendo a resposta...</p>
                </div>
              </article>
            ) : null}
          </div>

          <form className="composer" onSubmit={handleSubmit}>
            <label className="composer-label" htmlFor="message">
              Sua mensagem
            </label>
            <div className="composer-row">
              <textarea
                id="message"
                name="message"
                rows="3"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Pergunte ao agente em modo ${agentModes.find((mode) => mode.id === agentMode)?.label.toLowerCase()}...`}
              />
              <button type="submit" disabled={isLoading}>
                Enviar
              </button>
            </div>
            {error ? <p className="error">{error}</p> : null}
          </form>
        </section>
      </section>
    </main>
  );
}
