# 11 Realtime Events

| Event | Uretici | Tuketici |
| --- | --- | --- |
| `table.status.changed` | tables | admin, pos, mobile |
| `ticket.updated` | pos | pos, kitchen, admin |
| `payment.completed` | pos | pos, admin, mobile |
| `cash.closure.created` | accounting | admin, mobile |
| `attendance.recorded` | attendance | admin, mobile |
| `stock.alert.opened` | inventory | admin, mobile |
| `campaign.state.changed` | campaigns | admin, pos |
| `terminal.heartbeat` | integrations | admin |

## Socket Odalari
- `tenant:{companyId}`
- `branch:{branchId}`
- `user:{userId}`
- `terminal:{terminalId}`
