# Tydids - End User Guide

*Transform your documents into intelligent, searchable knowledge*

## 🚀 Quick Start

### Step 1: Access Tydids
1. Open your web browser and navigate to your Tydids instance
2. If you don't have an account, contact your administrator for registration
3. Log in with your username and password

### Step 2: Create Your First Collection
1. Click **"Create Collection"** in the dashboard
2. Enter a descriptive name (e.g., "Research Papers", "Company Policies")
3. Add an optional description
4. Click **"Create"**

### Step 3: Upload Documents
1. Select your collection
2. Choose one of three methods:
   - **Drag & Drop**: Simply drag files onto the upload area
   - **File Browser**: Click "Choose Files" to browse your computer
   - **Create Text**: Type or paste text directly
3. Supported formats: PDF, Word (.docx), plain text, images with text

### Step 4: Search and Ask Questions
1. Use the **Search** tab to find relevant content
2. Try the **AI Chat** tab to ask questions about your documents
3. Use the **Smart Context** feature for comprehensive analysis

## 📁 Managing Collections

### Creating Collections
Collections are containers for related documents. Examples:
- **Academic Research**: Research papers on a specific topic
- **Company Knowledge**: Policies, procedures, and documentation
- **Project Files**: Documents related to a specific project
- **Personal Library**: Books, articles, and notes

### Collection Features
- **Statistics**: View document count, total size, and last update
- **Search Scope**: Search within a specific collection
- **Sharing**: Collections can be shared with other users (if enabled)
- **Organization**: Group documents by topic or project

## 📄 Document Management

### Supported File Types
- **PDF Files** (.pdf) - Automatically extracts text content
- **Word Documents** (.docx) - Processes text and formatting
- **Plain Text** (.txt) - Direct text content
- **Images** (.jpg, .png, .gif) - Extracts text using OCR
- **Web Content** - Via URL import (if enabled)

### Upload Methods

#### Drag & Drop Upload
1. Navigate to your collection
2. Drag files from your computer to the upload area
3. Watch the progress bar for upload status
4. Files are automatically processed and indexed

#### File Browser Upload
1. Click **"Choose Files"** or **"Upload Files"**
2. Select multiple files using Ctrl/Cmd+click
3. Click **"Open"** to start the upload
4. Processing begins automatically

#### Create Text Document
1. Click **"Create Text"** in your collection
2. Enter a title for your document
3. Paste or type your content
4. Click **"Save"** to add it to your collection

#### URL Import (if available)
1. Click **"Add from URL"**
2. Paste the web page URL
3. The system fetches and processes the content
4. The processed content is added to your collection

### Document Processing
- **Automatic Text Extraction**: All document content is extracted and indexed
- **Chunk Creation**: Large documents are split into searchable chunks
- **Vector Embedding**: Content is converted to mathematical vectors for similarity search
- **Metadata Storage**: File information, upload date, and processing status are tracked

### Managing Documents
- **View Documents**: See all documents in a collection with metadata
- **Delete Documents**: Remove documents you no longer need
- **Download**: Access original files when available
- **Search Within**: Find specific documents using the search function

## 🔍 Search Capabilities

### Basic Search
1. Navigate to the **Search** tab
2. Enter your search query in natural language
3. Adjust the similarity threshold (higher = more precise)
4. View results ranked by relevance

### Advanced Search Features
- **Semantic Search**: Finds content by meaning, not just keywords
- **Similarity Threshold**: Control how closely results must match
- **Source Attribution**: Every result shows which document it came from
- **Context Snippets**: See relevant portions of matching documents

### Search Tips
- **Use natural language**: "What are the benefits of renewable energy?"
- **Be specific**: "How to implement OAuth2 authentication"
- **Try variations**: If one query doesn't work, rephrase it
- **Use questions**: The system is optimized for question-answering

### Global Search
- Search across all your collections simultaneously
- Access via the main **Search** section
- Filter results by collection
- Useful for finding information when you're not sure which collection contains it

## 💬 AI Chat Interface

### Starting a Conversation
1. Go to the **AI Chat** tab in any collection
2. Type your question in natural language
3. Press Enter or click **"Send"**
4. The AI will respond with relevant information from your documents

### AI Chat Features
- **Context-Aware**: Responses are based on your uploaded documents
- **Source Citations**: Every answer includes references to source documents
- **Follow-up Questions**: Continue the conversation for deeper insights
- **Conversation Memory**: The chat remembers previous messages in the session

### Best Practices for AI Chat
- **Ask specific questions**: "What is the main conclusion of the Smith 2023 study?"
- **Request summaries**: "Summarize the key points about climate change from my collection"
- **Compare information**: "What are the differences between Python and JavaScript based on my documents?"
- **Ask for analysis**: "What patterns do you see in the customer feedback data?"

### Example Conversations
```
You: What are the main benefits of artificial intelligence mentioned in my documents?

AI: Based on your documents, the main benefits of AI include:

1. **Automation and Efficiency** (from "AI in Business.pdf"):
   - Reduces manual labor and increases productivity
   - Enables 24/7 operations without human intervention

2. **Data Analysis** (from "Machine Learning Guide.docx"):
   - Processes large datasets quickly
   - Identifies patterns humans might miss

3. **Decision Support** (from "AI Strategy Report.pdf"):
   - Provides data-driven insights
   - Reduces human bias in decision-making

Would you like me to elaborate on any of these points?
```

## 🧠 Smart Context Feature

### What is Smart Context?
Smart Context is an advanced feature that generates comprehensive, well-organized summaries of your document collection based on your query. It goes beyond simple search to provide structured, analytical insights.

### How to Use Smart Context
1. Select a collection
2. Go to the **Smart Context** tab
3. Enter your research question or topic
4. Configure options:
   - **Max Context Size**: How much content to include
   - **Max Chunks**: Number of document sections to analyze
   - **Include Cluster Metadata**: Add organizational information
5. Click **"Generate Smart Context"**

### Smart Context Benefits
- **Comprehensive Analysis**: Combines information from multiple documents
- **Structured Output**: Organized, coherent presentation
- **Cluster Integration**: Leverages document organization and relationships
- **Export Ready**: Perfect for reports, presentations, or further analysis

### Example Use Cases
- **Research Summaries**: "Summarize the current state of renewable energy research"
- **Policy Analysis**: "What are the key compliance requirements for data protection?"
- **Market Research**: "What trends are emerging in the fintech industry?"
- **Educational Content**: "Explain the main concepts of machine learning"

## 📊 Usage Statistics

### Monitoring Your Usage
- **Dashboard Overview**: See your collection count, document count, and usage statistics
- **Tier Limits**: Understand your current plan limits and usage
- **Activity Tracking**: Monitor your search and upload activity

### Usage Tiers
Different tiers offer different capabilities:
- **Free Tier**: Basic functionality with limited resources
- **Pro Tier**: Enhanced limits and advanced features
- **Enterprise Tier**: Unlimited usage and premium support

### Best Practices for Efficiency
- **Organize Collections**: Keep related documents together
- **Regular Cleanup**: Remove outdated or irrelevant documents
- **Efficient Searching**: Use specific queries to get better results
- **Batch Uploads**: Upload multiple files at once for efficiency

## 🔐 Privacy and Security

### Data Privacy
- **User Isolation**: Your documents are only accessible to you
- **Secure Storage**: All content is encrypted and securely stored
- **No Sharing**: Documents are not shared unless explicitly configured
- **Access Controls**: Only you can access your collections and documents

### Security Features
- **JWT Authentication**: Secure token-based authentication
- **Encrypted Communication**: All data transfer is encrypted (HTTPS)
- **Audit Logging**: System tracks access for security monitoring
- **Regular Backups**: Your data is regularly backed up

## ❓ Troubleshooting

### Common Issues and Solutions

#### Upload Problems
**Problem**: File won't upload
**Solutions**:
- Check file size (limit: 10MB per file)
- Verify file format is supported
- Ensure stable internet connection
- Try uploading one file at a time

**Problem**: Processing takes too long
**Solutions**:
- Large files take more time to process
- PDF files with images require additional processing
- Check the document list for processing status
- Contact support if processing fails repeatedly

#### Search Issues
**Problem**: No search results
**Solutions**:
- Try different keywords or phrases
- Lower the similarity threshold
- Check if documents have been fully processed
- Ensure you're searching in the correct collection

**Problem**: Poor search results
**Solutions**:
- Use more specific queries
- Try question format: "How do I...?"
- Include context: "What does the document say about...?"
- Check document quality and content relevance

#### AI Chat Problems
**Problem**: AI gives irrelevant answers
**Solutions**:
- Ensure your documents contain relevant information
- Be more specific in your questions
- Check that documents are fully processed
- Try rephrasing your question

#### Performance Issues
**Problem**: System runs slowly
**Solutions**:
- Close unused browser tabs
- Clear browser cache
- Check internet connection
- Try again during off-peak hours

### Getting Help
1. **Check this guide**: Most common issues are covered here
2. **Contact Administrator**: For account or permission issues
3. **Technical Support**: For system problems or bugs
4. **Feature Requests**: Suggest improvements or new features

## 🎯 Tips for Success

### Organization Tips
- **Use descriptive collection names**: "Q3 Marketing Research" vs "Documents"
- **Add descriptions**: Help remember what each collection contains
- **Regular maintenance**: Remove outdated documents periodically
- **Logical grouping**: Keep related documents together

### Search Tips
- **Use natural language**: Write questions as you would ask a person
- **Be specific**: "Python error handling" vs "programming"
- **Include context**: "In the context of web development..."
- **Try multiple approaches**: Different phrasings can yield different results

### AI Chat Tips
- **Start with overview questions**: "What is this collection about?"
- **Build on previous questions**: Continue the conversation naturally
- **Ask for sources**: "Which document mentions this?"
- **Request different formats**: "Can you summarize this as bullet points?"

### Efficiency Tips
- **Batch operations**: Upload multiple files at once
- **Use global search**: When you're not sure which collection has the information
- **Bookmark important collections**: Quick access to frequently used collections
- **Export results**: Save important findings for later use

---

*Need more help? Contact your system administrator or technical support team.*
