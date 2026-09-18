/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react/pure';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';

// Mock navigation
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        privacy_title: 'Privacy Policy',
        policy_last_updated: 'Last updated: 07/2026',
        privacy_intro: 'The protection of your personal data is a particular concern of ours.',
        privacy_sec_1_title: 'Who is responsible for data processing and who can you contact?',
        privacy_sec_1_responsible_title: 'Responsible is',
        privacy_sec_1_responsible_text: 'Stiftung Deutschland im Plus Beuthener Straße 25',
        privacy_sec_1_dpo_title: 'The operational data protection officer is',
        privacy_sec_1_dpo_text: 'DPO Stiftung Deutschland im Plus',
        privacy_sec_2_title: 'What data is processed and from what sources does this data originate?',
        privacy_sec_2_intro: 'Within the app, we enable you to retrieve and display the following information:',
        privacy_sec_2_list_item_1: 'Manual income/expense overview',
        privacy_sec_2_list_item_2: 'Entries by members',
        privacy_sec_2_list_item_3: 'Import/export function',
        privacy_sec_2_personal_data_title: 'Personal data includes:',
        privacy_sec_2_personal_data_text: 'Entered name, email address',
        privacy_sec_2_usage_intro: 'When you use the app, we process your personal data.',
        privacy_sec_2_access_policy: 'You can access this privacy policy at any time.',
        privacy_sec_3_title: 'Information on the processing of your data',
        privacy_sec_3_intro: 'Certain information is already processed automatically.',
        privacy_sec_3_download_title: 'Information collected during download',
        privacy_sec_3_download_text: 'When downloading the app...',
        privacy_sec_3_auto_title: 'Information collected automatically',
        privacy_sec_3_auto_text: 'No data is collected automatically.',
        privacy_sec_3_reg_title: 'Data collected for registration',
        privacy_sec_3_reg_text: 'Creation of a user account...',
        privacy_sec_3_usage_title: 'Usage of the app',
        privacy_sec_3_usage_text: 'Within the app, you can manually enter...',
        privacy_sec_3_online_text: 'Internet access is required...',
        privacy_sec_3_justification_text: 'This data processing is justified by our legitimate interest...',
        privacy_sec_3_survey_title: 'Data processing within the framework of the user survey',
        privacy_sec_3_survey_text_1: 'Survey text 1',
        privacy_sec_3_survey_text_2: 'Survey text 2',
        privacy_sec_3_survey_text_3: 'Survey text 3',
        privacy_sec_3_survey_text_4: 'Survey text 4',
        privacy_sec_4_title: 'Am I obliged to provide data?',
        privacy_sec_4_text: 'The processing of your data is necessary...',
        privacy_sec_5_title: 'Who receives my data?',
        privacy_sec_5_text_1: 'We rely on contractually bound...',
        privacy_sec_5_hosting_title: 'Hosting and deployment:',
        privacy_sec_5_hosting_text: 'adorsys Germany',
        privacy_sec_5_text_2: 'Any transfer is justified...',
        privacy_sec_5_text_3: 'If it is necessary to investigate...',
        privacy_sec_5_text_4: 'Justified under Art. 6 Para. 1 lit. c...',
        privacy_sec_5_text_5: 'Corporate structure changes...',
        privacy_sec_5_text_6: 'Adapt corporate structure...',
        privacy_sec_6_title: 'How long is my data stored?',
        privacy_sec_6_text: 'We process your data until the end...',
        privacy_sec_7_title: 'Is personal data transferred to a third country?',
        privacy_sec_7_text: 'In principle, no data is transferred...',
        privacy_sec_8_title: 'Security',
        privacy_sec_8_text_1: 'We have taken technical precautions...',
        privacy_sec_8_text_2: 'Whenever we collect and process data...',
        privacy_sec_9_title: 'Cookies',
        privacy_sec_9_text: 'No cookies are set by this app.',
        privacy_sec_10_title: 'What data protection rights do I have?',
        privacy_sec_10_intro: 'You have a right at all times...',
        privacy_sec_10_right_access_title: 'Right of access:',
        privacy_sec_10_right_access_text: 'Access details text',
        privacy_sec_10_right_rectification_title: 'Right to rectification:',
        privacy_sec_10_right_rectification_text: 'Rectification details text',
        privacy_sec_10_right_erasure_title: 'Right to erasure:',
        privacy_sec_10_right_erasure_text_1: 'Erasure text 1',
        privacy_sec_10_right_erasure_text_2: 'Erasure text 2',
        privacy_sec_10_right_restriction_title: 'Right to restriction of processing:',
        privacy_sec_10_right_restriction_intro: 'Restriction intro text',
        privacy_sec_10_right_restriction_item_1: 'Restriction item 1',
        privacy_sec_10_right_restriction_item_2: 'Restriction item 2',
        privacy_sec_10_right_restriction_item_3: 'Restriction item 3',
        privacy_sec_10_right_restriction_item_4: 'Restriction item 4',
        privacy_sec_10_right_object_title: 'Right to object:',
        privacy_sec_10_right_object_text_1: 'Object text 1',
        privacy_sec_10_right_object_text_2: 'Object text 2',
        privacy_sec_10_right_portability_title: 'Right to data portability:',
        privacy_sec_10_right_portability_intro: 'Portability intro text',
        privacy_sec_10_right_portability_item_1: 'Portability item 1',
        privacy_sec_10_right_portability_item_2: 'Portability item 2',
        privacy_sec_10_right_portability_text: 'Portability text',
        privacy_sec_10_right_complaint_title: 'Right to complain:',
        privacy_sec_10_right_complaint_text_1: 'Complaint text 1',
        privacy_sec_10_right_complaint_text_2: 'Complaint text 2',
        privacy_sec_10_right_withdraw_title: 'Right to withdraw consent',
        privacy_sec_10_right_withdraw_text: 'Withdraw consent details text',
        privacy_sec_10_right_automated_title: 'Automated decision-making',
        privacy_sec_10_right_automated_text: 'Automated decision-making details text',
      };
      // eslint-disable-next-line security/detect-object-injection -- key is validated enum value/safe access pattern
      return translations[key] || key;
    },
    i18n: { language: 'en' },
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

// Mock BudgetContext
vi.mock('@/contexts/BudgetContext', () => ({
  useBudget: () => ({
    accounts: [{ id: '1', name: 'Test' }],
    currentAccount: { id: '1', name: 'Test' },
    switchAccount: vi.fn(),
    isLoading: false,
    isOfflineMode: false,
    setIsOfflineMode: vi.fn(),
    missedNotifications: [],
    dismissMissedNotifications: vi.fn(),
  }),
}));

// Mock AccountContext
vi.mock('@/contexts/AccountContext', () => ({
  useAccount: () => ({
    logout: vi.fn(),
    isAuthenticated: true,
    setIsAuthenticated: vi.fn(),
    resetOnboarding: vi.fn(),
  }),
}));

vi.mock('@/contexts/PendingInvitesContext', () => ({
  usePendingInvites: () => ({
    pendingInvites: [],
    isLoading: false,
    error: null,
    fetchPendingInvites: vi.fn(),
    acceptInvite: vi.fn(),
    declineInvite: vi.fn(),
    pendingCount: 0,
    acceptingInviteId: null,
    decliningInviteId: null,
  }),
  PendingInvitesProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import Datenschutz from './Datenschutz';

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    {children}
  </MemoryRouter>
);

describe('Datenschutz Page', () => {
  beforeAll(() => {
    render(
      <TestWrapper>
        <Datenschutz />
      </TestWrapper>,
    );
  });

  afterAll(() => {
    cleanup();
  });

  it('renders the privacy policy heading and last updated note', () => {
    expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
    expect(screen.getByText('Last updated: 07/2026')).toBeInTheDocument();
  });

  it('renders the introduction', () => {
    expect(screen.getByText('The protection of your personal data is a particular concern of ours.')).toBeInTheDocument();
  });

  it('renders section 1 – Controller', () => {
    expect(screen.getByText('Who is responsible for data processing and who can you contact?')).toBeInTheDocument();
    expect(screen.getAllByText('Stiftung Deutschland im Plus – die Stiftung für private Überschuldungsprävention').length).toBeGreaterThanOrEqual(1);
  });

  it('renders section 2 – Data Collected', () => {
    expect(screen.getByText('What data is processed and from what sources does this data originate?')).toBeInTheDocument();
    expect(screen.getByText('Manual income/expense overview')).toBeInTheDocument();
  });

  it('renders section 3 – Processing Details', () => {
    expect(screen.getByText('Information on the processing of your data')).toBeInTheDocument();
    expect(screen.getByText('Survey text 1')).toBeInTheDocument();
  });

  it('renders section 4 – Obligation', () => {
    expect(screen.getByText('Am I obliged to provide data?')).toBeInTheDocument();
  });

  it('renders section 5 – Recipients', () => {
    expect(screen.getByText('Who receives my data?')).toBeInTheDocument();
    expect(screen.getByText('adorsys Germany')).toBeInTheDocument();
  });

  it('renders section 6 – Retention', () => {
    expect(screen.getByText('How long is my data stored?')).toBeInTheDocument();
  });

  it('renders section 7 – Third Countries', () => {
    expect(screen.getByText('Is personal data transferred to a third country?')).toBeInTheDocument();
  });

  it('renders section 8 – Security', () => {
    expect(screen.getByText('Security')).toBeInTheDocument();
    expect(screen.getByText('We have taken technical precautions...')).toBeInTheDocument();
  });

  it('renders section 9 – Cookies', () => {
    expect(screen.getByText('Cookies')).toBeInTheDocument();
    expect(screen.getByText('No cookies are set by this app.')).toBeInTheDocument();
  });

  it('renders section 10 – Your Rights with bullet list', () => {
    expect(screen.getByText('What data protection rights do I have?')).toBeInTheDocument();
    expect(screen.getByText('Restriction item 1')).toBeInTheDocument();
    expect(screen.getByText('Portability item 1')).toBeInTheDocument();
  });
});
