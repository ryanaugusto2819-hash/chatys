import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Conversations from './Conversations';
import ChatView from './ChatView';
import { MessageSquare } from 'lucide-react';

export default function ConversationsLayout() {
  const { id } = useParams();
  const navigate = useNavigate();

  const handleSelectConversation = (conversationId: string) => {
    navigate(`/conversations/${conversationId}`, { replace: true });
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen overflow-hidden">
      {/* Left panel - Conversation list */}
      <div className={`${id ? 'hidden lg:flex' : 'flex'} w-full lg:w-[380px] xl:w-[420px] flex-col border-r border-border shrink-0 overflow-hidden`}>
        <Conversations
          embedded
          selectedId={id}
          onSelectConversation={handleSelectConversation}
        />
      </div>

      {/* Right panel - Chat */}
      <div className={`${id ? 'flex' : 'hidden lg:flex'} flex-1 flex-col min-w-0`}>
        {id ? (
          <ChatView
            embedded
            conversationId={id}
            onBack={() => navigate('/conversations', { replace: true })}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center bg-background">
            <div className="text-center space-y-3">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <MessageSquare className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Selecione uma conversa para começar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
