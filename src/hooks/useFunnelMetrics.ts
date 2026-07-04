import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { subDays } from 'date-fns';

export interface LeadJourneyStage {
  key: string;
  label: string;
  count: number;
  rate: number; // % from total
  dropOff: number; // % drop from previous stage
}

export interface FollowUpEngagement {
  sent: number;
  responded: number;
  responseRate: number;
  pending: number;
}

export interface LeadResponseMetrics {
  avgCustomerMessages: number;
  avgAgentMessages: number;
  avgBotMessages: number;
  conversationsWithCustomerReply: number;
  conversationsWithoutReply: number;
  replyRate: number;
}

export function useFunnelMetrics(days: number = 30) {
  const since = subDays(new Date(), days).toISOString();

  const journeyQuery = useQuery({
    queryKey: ['lead-journey', days],
    queryFn: async () => {
      // Paginate to bypass Supabase default 1000-row cap
      const PAGE = 1000;
      const convos: Array<{ id: string; status: string; created_at: string; contact_phone: string }> = [];
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await supabase
          .from('conversations')
          .select('id, status, created_at, contact_phone')
          .gte('created_at', since)
          .order('created_at', { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (error) { console.error('useFunnelMetrics page error:', error); break; }
        const rows = data ?? [];
        convos.push(...rows);
        if (rows.length < PAGE) break;
      }
      const convIds = convos.map(c => c.id);
      if (convIds.length === 0) return { stages: [] as LeadJourneyStage[], responseMetrics: null };


      // 2. Fetch messages for these conversations (batch)
      const allMessages: Array<{ conversation_id: string; sender_type: string; created_at: string }> = [];
      const chunkSize = 100;
      const chunks: string[][] = [];
      for (let i = 0; i < convIds.length; i += chunkSize) {
        chunks.push(convIds.slice(i, i + chunkSize));
      }
      const chunkResults = await Promise.all(
        chunks.map(chunk =>
          supabase
            .from('messages')
            .select('conversation_id, sender_type, created_at')
            .in('conversation_id', chunk)
            .order('created_at', { ascending: true })
        )
      );
      chunkResults.forEach(({ data, error }) => {
        if (error) { console.error('useFunnelMetrics chunk error:', error); return; }
        if (data) allMessages.push(...data);
      });

      // Group messages by conversation
      const msgsByConv = new Map<string, typeof allMessages>();
      allMessages.forEach(m => {
        const list = msgsByConv.get(m.conversation_id) ?? [];
        list.push(m);
        msgsByConv.set(m.conversation_id, list);
      });

      // Calculate journey stages
      const totalLeads = convos.length;

      // Stage: Bot/agent contacted (has at least 1 bot or agent message)
      let contacted = 0;
      // Stage: Lead responded (customer sent at least 1 message after a bot/agent message)
      let responded = 0;
      // Stage: Lead engaged (customer sent 2+ messages = ongoing conversation)
      let engaged = 0;
      // Stage: In active attendance
      let inAttendance = 0;
      // Stage: Resolved / Sale
      let resolved = 0;

      let totalCustomerMsgs = 0;
      let totalAgentMsgs = 0;
      let totalBotMsgs = 0;

      convos.forEach(conv => {
        const msgs = msgsByConv.get(conv.id) ?? [];
        const botAgentMsgs = msgs.filter(m => m.sender_type === 'bot' || m.sender_type === 'agent');
        const customerMsgs = msgs.filter(m => m.sender_type === 'customer');

        totalCustomerMsgs += customerMsgs.length;
        totalAgentMsgs += msgs.filter(m => m.sender_type === 'agent').length;
        totalBotMsgs += msgs.filter(m => m.sender_type === 'bot').length;

        if (botAgentMsgs.length > 0) {
          contacted++;

          // Check if customer replied AFTER the first bot/agent message
          const firstOutbound = botAgentMsgs[0].created_at;
          const repliesAfter = customerMsgs.filter(m => m.created_at > firstOutbound);

          if (repliesAfter.length > 0) {
            responded++;
          }
          if (repliesAfter.length >= 2) {
            engaged++;
          }
        }

        if (conv.status === 'active') inAttendance++;
        if (conv.status === 'resolved') resolved++;
      });

      const stages: LeadJourneyStage[] = [
        { key: 'leads', label: 'Leads Recebidos', count: totalLeads, rate: 100, dropOff: 0 },
        { key: 'contacted', label: 'Contatados (Bot/Atendente)', count: contacted, rate: totalLeads > 0 ? round(contacted / totalLeads * 100) : 0, dropOff: totalLeads > 0 ? round((totalLeads - contacted) / totalLeads * 100) : 0 },
        { key: 'responded', label: 'Responderam', count: responded, rate: totalLeads > 0 ? round(responded / totalLeads * 100) : 0, dropOff: contacted > 0 ? round((contacted - responded) / contacted * 100) : 0 },
        { key: 'engaged', label: 'Engajaram (2+ respostas)', count: engaged, rate: totalLeads > 0 ? round(engaged / totalLeads * 100) : 0, dropOff: responded > 0 ? round((responded - engaged) / responded * 100) : 0 },
        { key: 'attendance', label: 'Em Atendimento', count: inAttendance, rate: totalLeads > 0 ? round(inAttendance / totalLeads * 100) : 0, dropOff: engaged > 0 ? round((engaged - inAttendance) / engaged * 100) : 0 },
        { key: 'resolved', label: 'Resolvido / Venda', count: resolved, rate: totalLeads > 0 ? round(resolved / totalLeads * 100) : 0, dropOff: inAttendance > 0 ? round((inAttendance - resolved) / inAttendance * 100) : 0 },
      ];

      const convsWithReply = responded;
      const convsWithoutReply = totalLeads - responded;

      const responseMetrics: LeadResponseMetrics = {
        avgCustomerMessages: totalLeads > 0 ? round(totalCustomerMsgs / totalLeads) : 0,
        avgAgentMessages: totalLeads > 0 ? round(totalAgentMsgs / totalLeads) : 0,
        avgBotMessages: totalLeads > 0 ? round(totalBotMsgs / totalLeads) : 0,
        conversationsWithCustomerReply: convsWithReply,
        conversationsWithoutReply: convsWithoutReply,
        replyRate: totalLeads > 0 ? round(convsWithReply / totalLeads * 100) : 0,
      };

      return { stages, responseMetrics };
    },
  });

  const followUpQuery = useQuery({
    queryKey: ['lead-followup-engagement', days],
    queryFn: async (): Promise<FollowUpEngagement> => {
      const { data } = await supabase
        .from('follow_up_executions')
        .select('status')
        .gte('created_at', since);

      const items = data ?? [];
      const sent = items.filter(i => i.status === 'sent' || i.status === 'responded').length;
      const responded = items.filter(i => i.status === 'responded').length;
      const pending = items.filter(i => i.status === 'pending').length;

      return {
        sent,
        responded,
        responseRate: sent > 0 ? round(responded / sent * 100) : 0,
        pending,
      };
    },
  });

  return {
    stages: journeyQuery.data?.stages ?? [],
    responseMetrics: journeyQuery.data?.responseMetrics ?? null,
    followUp: followUpQuery.data ?? null,
    isLoading: journeyQuery.isLoading || followUpQuery.isLoading,
  };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
