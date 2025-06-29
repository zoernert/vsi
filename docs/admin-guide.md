# Tydids - Administrator Guide

*Complete system administration and user management*

## 🔑 Administrator Access

### Accessing Admin Panel
1. Log in with administrator credentials
2. Navigate to `/admin/` or click the admin menu
3. Access the comprehensive admin dashboard

### Default Admin Account
- **Username**: `admin` (configurable via .env)
- **Password**: `admin` (configurable via .env)
- **Note**: Change default credentials immediately in production

## 👥 User Management

### User Overview
The admin dashboard provides comprehensive user management capabilities:
- **Total Users**: Current user count and growth trends
- **User Tiers**: Distribution across free, pro, and enterprise tiers
- **Active Users**: Users who logged in within the last 30 days
- **Admin Users**: Count of users with administrative privileges

### Creating Users
1. Navigate to **User Management** in the admin panel
2. Click **"Create New User"**
3. Fill in required information:
   - **Username**: Unique identifier
   - **Password**: Initial password (user should change)
   - **Email**: Contact email address
   - **Tier**: free, pro, or enterprise
   - **Admin Status**: Grant or deny admin privileges
4. Click **"Create User"**

### Managing Existing Users
- **View All Users**: Paginated list with search and filtering
- **Edit User Details**: Update tier, admin status, or contact information
- **Delete Users**: Remove user accounts (with confirmation)
- **Reset Passwords**: Generate new passwords for users
- **Usage Statistics**: View individual user activity and consumption

### User Tier Management

#### Free Tier
- **Collections**: 5 maximum
- **Documents**: 100 per collection
- **Searches**: 500 per month
- **Storage**: 1GB total
- **Support**: Community support

#### Pro Tier
- **Collections**: 25 maximum
- **Documents**: 1,000 per collection
- **Searches**: 10,000 per month
- **Storage**: 10GB total
- **Support**: Email support

#### Enterprise Tier
- **Collections**: Unlimited
- **Documents**: Unlimited per collection
- **Searches**: Unlimited
- **Storage**: Unlimited
- **Support**: Priority support with SLA

### Bulk User Operations
- **CSV Import**: Import users from spreadsheet
- **Bulk Tier Updates**: Change multiple users' tiers simultaneously
- **Usage Reports**: Generate reports for multiple users
- **Notifications**: Send system announcements to users

## 📊 System Monitoring

### Health Check Dashboard
Monitor critical system components:

#### Database Health
- **PostgreSQL Status**: Connection and performance metrics
- **Query Performance**: Slow query detection and optimization
- **Storage Usage**: Database size and growth trends
- **Connection Pool**: Active connections and capacity

#### Vector Database (Qdrant)
- **Service Status**: Qdrant cluster health
- **Collection Count**: Total vector collections
- **Index Performance**: Search latency and throughput
- **Storage Metrics**: Vector data size and memory usage

#### AI Services
- **Embedding Service**: OpenAI/Google API connectivity
- **LLM Service**: Chat completion service status
- **Rate Limits**: API usage and throttling status
- **Cost Tracking**: AI service costs and usage patterns

#### Application Services
- **Server Uptime**: Application availability
- **Memory Usage**: Node.js heap and system memory
- **CPU Utilization**: Processing load and performance
- **Error Rates**: Application error frequency and types

### Performance Metrics

#### Usage Analytics
- **Active Users**: Daily, weekly, and monthly active users
- **API Calls**: Endpoint usage and performance
- **Document Processing**: Upload and processing volumes
- **Search Activity**: Search frequency and performance

#### Resource Utilization
- **Storage Growth**: Document storage trends
- **Bandwidth Usage**: Upload/download traffic
- **Processing Time**: Document processing performance
- **Cache Hit Rates**: System caching effectiveness

#### Error Monitoring
- **Application Errors**: Server-side error tracking
- **User Errors**: Client-side error reporting
- **Failed Operations**: Upload, search, and processing failures
- **Recovery Metrics**: System recovery time and success rates

### Alerts and Notifications
Configure alerts for:
- **Service Downtime**: Immediate notification of service failures
- **Performance Degradation**: Alerts when response times exceed thresholds
- **Storage Limits**: Warnings when storage approaches capacity
- **Error Thresholds**: Notifications when error rates spike
- **Security Events**: Alerts for suspicious activity

## 🔧 System Configuration

### Environment Variables
Critical configuration settings in `.env`:

```bash
# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/vsi_vector_store
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=vsi_vector_store
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password

# Qdrant Configuration
QDRANT_URL=http://localhost:6333

# AI Services
OPENAI_API_KEY=your_openai_api_key
GOOGLE_API_KEY=your_google_api_key

# Authentication
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=24h

# Admin Configuration
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin

# Features
ALLOW_SELF_REGISTRATION=false
ALLOW_RAPIDAPI_USERS=false
ENABLE_EXTERNAL_CONTENT=true

# Server Configuration
PORT=3000
NODE_ENV=production
```

### Feature Toggles
Control system features via environment variables:
- **Self Registration**: Allow users to create their own accounts
- **RapidAPI Integration**: Enable API marketplace integration
- **External Content**: Enable web search and content fetching
- **Agent System**: Enable autonomous research agents
- **MCP Support**: Enable Model Context Protocol integration

### Tier Configuration
Customize tier limits in `/src/config/tiers.js`:

```javascript
const TIER_LIMITS = {
  free: {
    collections: 5,
    documents_per_collection: 100,
    searches_per_month: 500,
    uploads_per_month: 50,
    storage_bytes: 1024 * 1024 * 1024 // 1GB
  },
  pro: {
    collections: 25,
    documents_per_collection: 1000,
    searches_per_month: 10000,
    uploads_per_month: 500,
    storage_bytes: 10 * 1024 * 1024 * 1024 // 10GB
  },
  enterprise: {
    collections: -1, // unlimited
    documents_per_collection: -1,
    searches_per_month: -1,
    uploads_per_month: -1,
    storage_bytes: -1
  }
};
```

## 🛠️ Maintenance Operations

### Database Maintenance

#### Regular Maintenance Tasks
- **Vacuum Operations**: Reclaim storage space
- **Index Maintenance**: Rebuild and optimize indexes
- **Statistics Updates**: Refresh query planner statistics
- **Backup Verification**: Ensure backup integrity

#### Backup Procedures
```bash
# Daily backup
pg_dump vsi_vector_store > backup_$(date +%Y%m%d).sql

# Compressed backup
pg_dump vsi_vector_store | gzip > backup_$(date +%Y%m%d).sql.gz

# Restore from backup
psql vsi_vector_store < backup_20241201.sql
```

#### Database Migrations
```bash
# Run pending migrations
npm run migrate

# Create new migration
npm run migrate:create -- migration_name

# Rollback migration
npm run migrate:rollback
```

### Vector Database Maintenance

#### Qdrant Collections
- **Collection Optimization**: Rebuild indexes for better performance
- **Storage Compaction**: Reduce storage footprint
- **Backup Collections**: Export vector data for backup
- **Performance Tuning**: Adjust search parameters

#### Collection Management
```bash
# List all collections
curl http://localhost:6333/collections

# Get collection info
curl http://localhost:6333/collections/{collection_name}

# Optimize collection
curl -X POST http://localhost:6333/collections/{collection_name}/optimize
```

### File System Maintenance

#### Upload Directory Cleanup
- **Orphaned Files**: Remove files without database references
- **Temporary Files**: Clean up processing artifacts
- **Old Backups**: Remove outdated backup files
- **Log Rotation**: Manage log file sizes

#### Storage Monitoring
```bash
# Check upload directory size
du -sh uploads/

# Find large files
find uploads/ -size +100M -ls

# Clean orphaned files
node scripts/cleanup-orphaned-files.js
```

### Application Maintenance

#### Log Management
```bash
# View error logs
tail -f logs/error.log

# View combined logs
tail -f logs/combined.log

# Rotate logs
logrotate -f /etc/logrotate.d/tydids
```

#### Performance Optimization
- **Memory Monitoring**: Track Node.js heap usage
- **CPU Profiling**: Identify performance bottlenecks
- **Query Optimization**: Improve database query performance
- **Caching Strategy**: Implement and tune caching layers

## 🔒 Security Management

### Access Control
- **Role-Based Access**: Admin vs regular user permissions
- **API Authentication**: JWT token management
- **Session Management**: User session security
- **Rate Limiting**: Prevent abuse and DoS attacks

### Security Monitoring
- **Failed Login Attempts**: Track and alert on suspicious activity
- **API Abuse**: Monitor for unusual API usage patterns
- **File Upload Security**: Scan uploads for malicious content
- **Data Access Logs**: Audit trail for sensitive operations

### Security Best Practices
- **Regular Updates**: Keep dependencies updated
- **SSL/TLS**: Ensure encrypted communication
- **Input Validation**: Sanitize all user inputs
- **Error Handling**: Avoid information leakage in errors
- **Backup Security**: Encrypt backup files

### Incident Response
1. **Detection**: Monitor logs and alerts
2. **Containment**: Isolate affected systems
3. **Investigation**: Analyze security events
4. **Recovery**: Restore normal operations
5. **Post-Incident**: Review and improve procedures

## 📈 Analytics and Reporting

### Usage Reports
Generate comprehensive reports on:
- **User Activity**: Login patterns and feature usage
- **Content Growth**: Document upload and collection trends
- **Search Analytics**: Popular queries and success rates
- **Performance Metrics**: System response times and availability

### Business Intelligence
- **User Engagement**: Feature adoption and usage patterns
- **Resource Utilization**: Capacity planning and optimization
- **Cost Analysis**: Infrastructure and operational costs
- **Growth Trends**: User acquisition and retention metrics

### Custom Reports
Create custom reports using SQL queries:
```sql
-- Most active users
SELECT u.username, COUNT(ul.id) as activity_count
FROM users u
JOIN usage_logs ul ON u.id = ul.user_id
WHERE ul.created_at > NOW() - INTERVAL '30 days'
GROUP BY u.username
ORDER BY activity_count DESC
LIMIT 10;

-- Collection growth
SELECT DATE(created_at) as date, COUNT(*) as collections_created
FROM collections
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date;
```

## 🚨 Troubleshooting

### Common Issues

#### Service Startup Problems
**Symptoms**: Server won't start or crashes immediately
**Solutions**:
1. Check environment variables are set correctly
2. Verify database connectivity
3. Ensure Qdrant is running and accessible
4. Check file permissions for uploads directory
5. Review error logs for specific issues

#### Database Connection Issues
**Symptoms**: Database connection errors
**Solutions**:
1. Verify PostgreSQL is running
2. Check connection parameters in .env
3. Test database connectivity manually
4. Review firewall and network settings
5. Check database user permissions

#### Vector Database Problems
**Symptoms**: Search functionality fails
**Solutions**:
1. Verify Qdrant service is running
2. Check Qdrant URL configuration
3. Test Qdrant API endpoints manually
4. Review Qdrant logs for errors
5. Restart Qdrant service if necessary

#### Performance Issues
**Symptoms**: Slow response times or timeouts
**Solutions**:
1. Monitor server resource usage
2. Check database query performance
3. Review application logs for bottlenecks
4. Optimize database indexes
5. Consider scaling resources

#### Authentication Problems
**Symptoms**: Users can't log in or sessions expire
**Solutions**:
1. Verify JWT secret is configured
2. Check token expiration settings
3. Review authentication middleware
4. Test login endpoints manually
5. Check for clock synchronization issues

### Diagnostic Tools

#### Health Checks
```bash
# Overall system health
curl http://localhost:3000/api/health

# Database health
curl http://localhost:3000/api/admin/system/health

# Qdrant health
curl http://localhost:6333/
```

#### Log Analysis
```bash
# Search for errors
grep -i error logs/combined.log

# Find performance issues
grep -i "slow\|timeout" logs/combined.log

# Monitor real-time logs
tail -f logs/combined.log | grep -i "error\|warn"
```

#### Performance Monitoring
```bash
# System resource usage
top -p $(pgrep node)

# Memory usage
ps aux | grep node

# Disk usage
df -h
du -sh uploads/ logs/
```

## 🔄 Backup and Recovery

### Backup Strategy
Implement comprehensive backup procedures:

#### Database Backups
```bash
# Daily full backup
pg_dump vsi_vector_store > daily_backup_$(date +%Y%m%d).sql

# Weekly compressed backup
pg_dump vsi_vector_store | gzip > weekly_backup_$(date +%Y%m%d).sql.gz
```

#### File System Backups
```bash
# Backup uploads directory
tar -czf uploads_backup_$(date +%Y%m%d).tar.gz uploads/

# Backup configuration
tar -czf config_backup_$(date +%Y%m%d).tar.gz .env src/config/
```

#### Vector Database Backups
```bash
# Export Qdrant collections
curl -X POST http://localhost:6333/collections/{collection}/snapshots
```

### Recovery Procedures

#### Database Recovery
```bash
# Restore from backup
dropdb vsi_vector_store
createdb vsi_vector_store
psql vsi_vector_store < daily_backup_20241201.sql
```

#### Application Recovery
1. Stop application services
2. Restore database from backup
3. Restore file system from backup
4. Restart services
5. Verify functionality

### Disaster Recovery
- **Remote Backups**: Store backups in remote locations
- **Replication**: Set up database replication
- **Documentation**: Maintain recovery procedures
- **Testing**: Regularly test recovery procedures
- **Communication**: Establish incident communication plan

---

*For technical support or advanced configuration needs, contact the development team or consult the technical documentation.*
