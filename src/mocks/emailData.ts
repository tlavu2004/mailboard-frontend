// Mock data for email dashboard
export interface MockMailbox {
  id: string;
  name: string;
  icon: string;
  unreadCount: number;
  type: 'system' | 'custom';
}

export interface MockEmail {
  id: string;
  mailboxId: string;
  from: {
    name: string;
    email: string;
  };
  to: Array<{
    name: string;
    email: string;
  }>;
  cc?: Array<{
    name: string;
    email: string;
  }>;
  subject: string;
  preview: string;
  body: string;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  attachments?: Array<{
    id: string;
    filename: string;
    size: number;
    mimeType: string;
    url: string;
  }>;
  receivedAt: string;
}

export const mockMailboxes: MockMailbox[] = [
  {
    id: 'inbox',
    name: 'Inbox',
    icon: 'InboxOutlined',
    unreadCount: 5,
    type: 'system',
  },
  {
    id: 'starred',
    name: 'Starred',
    icon: 'StarOutlined',
    unreadCount: 0,
    type: 'system',
  },
  {
    id: 'sent',
    name: 'Sent',
    icon: 'SendOutlined',
    unreadCount: 0,
    type: 'system',
  },
  {
    id: 'drafts',
    name: 'Drafts',
    icon: 'EditOutlined',
    unreadCount: 2,
    type: 'system',
  },
  {
    id: 'archive',
    name: 'Archive',
    icon: 'InboxOutlined',
    unreadCount: 0,
    type: 'system',
  },
  {
    id: 'trash',
    name: 'Trash',
    icon: 'DeleteOutlined',
    unreadCount: 0,
    type: 'system',
  },
];

export const mockEmails: MockEmail[] = [
  {
    id: '1',
    mailboxId: 'inbox',
    from: {
      name: 'John Doe',
      email: 'john.doe@example.com',
    },
    to: [
      {
        name: 'Me',
        email: 'me@example.com',
      },
    ],
    subject: 'Welcome to MailBoard!',
    preview: 'Thank you for signing up. We are excited to have you on board...',
    body: `<h2>Welcome to MailBoard!</h2>
  <p>Thank you for signing up. We are excited to have you on board.</p>
<p>Here are some tips to get started:</p>
<ul>
  <li>Organize your emails into folders</li>
  <li>Use the star feature to mark important emails</li>
  <li>Search functionality coming soon!</li>
</ul>
<p>Best regards,<br/>The MailBoard Team</p>`,
    isRead: false,
    isStarred: true,
    hasAttachments: false,
    receivedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 min ago
  },
  {
    id: '2',
    mailboxId: 'inbox',
    from: {
      name: 'GitHub',
      email: 'noreply@github.com',
    },
    to: [
      {
        name: 'Me',
        email: 'me@example.com',
      },
    ],
    subject: '[GitHub] New pull request in your repository',
    preview: 'A new pull request has been opened in react-email-app by contributor-123...',
    body: `<h3>New Pull Request</h3>
<p>A new pull request has been opened in <strong>react-email-app</strong> by <strong>contributor-123</strong>.</p>
<p><strong>Title:</strong> Add authentication flow</p>
<p><strong>Description:</strong> This PR implements the complete authentication flow with email/password and Google Sign-In.</p>
<p><a href="#">View Pull Request</a></p>`,
    isRead: false,
    isStarred: false,
    hasAttachments: false,
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
  },
  {
    id: '3',
    mailboxId: 'inbox',
    from: {
      name: 'LinkedIn',
      email: 'messages-noreply@linkedin.com',
    },
    to: [
      {
        name: 'Me',
        email: 'me@example.com',
      },
    ],
    subject: 'You have 3 new connection requests',
    preview: 'Sarah Johnson, Michael Chen, and Emma Wilson want to connect with you...',
    body: `<h3>You have 3 new connection requests</h3>
<ul>
  <li><strong>Sarah Johnson</strong> - Senior Software Engineer at Tech Corp</li>
  <li><strong>Michael Chen</strong> - Product Manager at Startup Inc</li>
  <li><strong>Emma Wilson</strong> - UX Designer at Design Studio</li>
</ul>
<p><a href="#">View all connection requests</a></p>`,
    isRead: true,
    isStarred: false,
    hasAttachments: false,
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), // 5 hours ago
  },
  {
    id: '4',
    mailboxId: 'inbox',
    from: {
      name: 'AWS Notifications',
      email: 'no-reply@aws.amazon.com',
    },
    to: [
      {
        name: 'Me',
        email: 'me@example.com',
      },
    ],
    cc: [
      {
        name: 'DevOps Team',
        email: 'devops@company.com',
      },
    ],
    subject: 'AWS Bill Statement for November 2025',
    preview: 'Your AWS usage charges for November 2025 are now available...',
    body: `<h3>AWS Bill Statement</h3>
<p>Your AWS usage charges for November 2025 are now available.</p>
<table border="1" cellpadding="10">
  <tr>
    <th>Service</th>
    <th>Cost</th>
  </tr>
  <tr>
    <td>EC2 Instances</td>
    <td>$45.23</td>
  </tr>
  <tr>
    <td>S3 Storage</td>
    <td>$12.89</td>
  </tr>
  <tr>
    <td>RDS Database</td>
    <td>$28.50</td>
  </tr>
  <tr>
    <td><strong>Total</strong></td>
    <td><strong>$86.62</strong></td>
  </tr>
</table>
<p><a href="#">View detailed bill</a></p>`,
    isRead: false,
    isStarred: true,
    hasAttachments: true,
    attachments: [
      {
        id: 'att1',
        filename: 'aws-bill-november-2025.pdf',
        size: 245678,
        mimeType: 'application/pdf',
        url: '#',
      },
    ],
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
  },
  {
    id: '5',
    mailboxId: 'inbox',
    from: {
      name: 'Team Lead',
      email: 'team.lead@company.com',
    },
    to: [
      {
        name: 'Development Team',
        email: 'dev-team@company.com',
      },
    ],
    subject: 'Sprint Planning Meeting - Tomorrow 10 AM',
    preview: 'Hi team, We will have our sprint planning meeting tomorrow at 10 AM...',
    body: `<h3>Sprint Planning Meeting</h3>
<p>Hi team,</p>
<p>We will have our sprint planning meeting tomorrow at <strong>10 AM</strong> in Conference Room B.</p>
<p><strong>Agenda:</strong></p>
<ol>
  <li>Review last sprint outcomes</li>
  <li>Plan tasks for the upcoming sprint</li>
  <li>Discuss technical challenges</li>
  <li>Q&A session</li>
</ol>
<p>Please come prepared with your task estimates.</p>
<p>Best,<br/>Team Lead</p>`,
    isRead: false,
    isStarred: false,
    hasAttachments: false,
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(), // 2 days ago
  },
  {
    id: '6',
    mailboxId: 'sent',
    from: {
      name: 'Me',
      email: 'me@example.com',
    },
    to: [
      {
        name: 'Client',
        email: 'client@example.com',
      },
    ],
    subject: 'Project Update - Week 45',
    preview: 'Dear Client, I wanted to share the progress we made this week...',
    body: `<h3>Project Update - Week 45</h3>
<p>Dear Client,</p>
<p>I wanted to share the progress we made this week:</p>
<ul>
  <li>✅ Completed authentication module</li>
  <li>✅ Implemented email dashboard UI</li>
  <li>🔄 Working on API integration</li>
  <li>📅 Testing scheduled for next week</li>
</ul>
<p>We are on track for the deadline. Let me know if you have any questions.</p>
<p>Best regards,<br/>Your Name</p>`,
    isRead: true,
    isStarred: false,
    hasAttachments: false,
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(), // 3 days ago
  },
  {
    id: '7',
    mailboxId: 'drafts',
    from: {
      name: 'Me',
      email: 'me@example.com',
    },
    to: [
      {
        name: 'HR',
        email: 'hr@company.com',
      },
    ],
    subject: 'Vacation Request',
    preview: '[Draft] I would like to request vacation days from...',
    body: `<p>I would like to request vacation days from December 20-30, 2025.</p>
<p>I will ensure all my tasks are completed before I leave.</p>`,
    isRead: true,
    isStarred: false,
    hasAttachments: false,
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1).toISOString(),
  },
  {
    id: '8',
    mailboxId: 'starred',
    from: {
      name: 'Product Manager',
      email: 'pm@company.com',
    },
    to: [
      {
        name: 'Me',
        email: 'me@example.com',
      },
    ],
    subject: 'Q4 Goals & OKRs',
    preview: 'Here are the Q4 goals we discussed in the planning meeting...',
    body: `<h3>Q4 Goals & OKRs</h3>
<p>Here are the Q4 goals we discussed:</p>
<ol>
  <li>Launch new authentication system</li>
  <li>Improve email dashboard performance by 50%</li>
  <li>Implement offline support</li>
  <li>Reach 10,000 active users</li>
</ol>
<p>Let's make this quarter count!</p>`,
    isRead: true,
    isStarred: true,
    hasAttachments: false,
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(), // 1 week ago
  },
];
