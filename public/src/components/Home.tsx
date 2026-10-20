import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Container,
  Title,
  Paper,
  Select,
  Radio,
  Group,
  Button,
  Text,
  Loader,
} from '@mantine/core';

const companies = [
  { id: `BC_1`, name: 'Blue Cheese Inc' },
  { id: `QP_2`, name: 'Quantum Pets' },
  { id: `EF_3`, name: 'EcoFriendship Ltd' },
  { id: `NR_4`, name: 'Neon Robotics' },
  { id: `SSE_5`, name: 'SolarSphere Energy' },
  { id: `BBF_6`, name: 'ByteBites Foods' },
  { id: `ACS_7`, name: 'AeroCloud Systems' },
  { id: `CWAR_8`, name: 'CrystalWear AR' },
  { id: `HAIL_9`, name: 'Harbor AI Logistics' },
  { id: `VRM_10`, name: 'VelvetRide Mobility' },
];

type ReportType = 'high-level' | 'detailed';

interface ReportRequest {
  companyId: string;
  reportType: ReportType;
}

// The API returns { reportMarkdown, error } on failure; fall back to a generic
// message when the body isn't that shape (e.g. the proxy can't reach the server).
async function getErrorMessage(res: Response): Promise<string> {
  try {
    const data: { error?: string } = await res.json();
    if (data.error) return `${data.error}. Please try again.`;
  } catch {
    // Body wasn't JSON.
  }
  return `Request failed (${res.status}). Please try again.`;
}

const ReportGenerator = observer(() => {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [reportType, setReportType] = useState<ReportType>(
    'high-level'
  );
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the shown report came from the server cache; null otherwise.
  // Keeps the request that produced it, so Refresh regenerates that report
  // even if the form selection has changed since.
  const [cachedReport, setCachedReport] = useState<
    (ReportRequest & { generatedAt: string }) | null
  >(null);

  function onGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) {
      setError('Please select a company.');
      return;
    }
    generate({ companyId, reportType }, false);
  }

  // forceRefresh makes the server skip its report cache and call the LLM again.
  async function generate(request: ReportRequest, forceRefresh: boolean) {
    setError(null);
    setMarkdown('');
    setCachedReport(null);

    setLoading(true);
    try {
      const company = companies.find((c) => c.id === request.companyId);
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: company?.name,
          companyId: request.companyId,
          reportType: request.reportType,
          forceRefresh,
        }),
      });

      if (!res.ok) throw new Error(await getErrorMessage(res));

      const data: {
        reportMarkdown: string;
        cached?: boolean;
        generatedAt?: string;
      } = await res.json();
      setMarkdown(data.reportMarkdown || '');
      if (data.cached && data.generatedAt) {
        setCachedReport({ ...request, generatedAt: data.generatedAt });
      }
    } catch (err: any) {
      setError(err?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Container size='sm' py='xl'>
      <Title order={2} ta='center' mb='lg'>
        Investment Report Generator
      </Title>

      <Paper radius='md' p='lg'>
        <form onSubmit={onGenerate}>
          <Select
            label=''
            placeholder='Select a company'
            value={companyId}
            onChange={setCompanyId}
            data={companies.map((c) => ({ value: c.id, label: c.name }))}
            mb='md'
          />

          <Radio.Group
            label=''
            value={reportType}
            onChange={(val) => setReportType(val as ReportType)}
            mb='md'
          >
            <Group>
              <Radio value='high-level' label='High-level report' />
              <Radio value='detailed' label='Detailed report' />
            </Group>
          </Radio.Group>

          <Group mt='md'>
            <Button type='submit' disabled={loading} fullWidth>
              {loading ? <Loader size='xs' /> : 'Generate Report'}
            </Button>
            {error && (
              <Text c='red' size='sm'>
                {error}
              </Text>
            )}
          </Group>
        </form>
      </Paper>

      <Paper radius='md' p='lg' mt='lg'>
        {cachedReport && (
          <Group justify='space-between' mb='sm'>
            <Text size='sm' c='dimmed'>
              Loaded from cache (generated{' '}
              {new Date(cachedReport.generatedAt).toLocaleTimeString()})
            </Text>
            <Button
              size='xs'
              variant='light'
              disabled={loading}
              onClick={() => generate(cachedReport, true)}
            >
              Refresh
            </Button>
          </Group>
        )}
        {markdown ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        ) : (
          <Text size='sm' c='dimmed' ta='center'>
            Report output will render here as Markdown.
          </Text>
        )}
      </Paper>
    </Container>
  );
});

export default ReportGenerator;
