# Docker Deployment Guide

Complete guide for running the Markdown Notes app in Docker.

## 🚀 Quick Start

### Development (Simplest)

```bash
# Build and run with docker-compose
docker-compose up -d

# Access the app
open http://localhost:3000
```

### Production

```bash
# Create production environment file
cp .env.example .env.production

# Edit .env.production with your secrets
nano .env.production

# Run production setup
docker-compose -f docker-compose.prod.yml up -d
```

## 📋 Prerequisites

- Docker 20.10+ installed
- Docker Compose 1.29+ installed
- 512MB RAM minimum
- 1GB disk space

## 🔧 Configuration

### Environment Variables

Create a `.env.production` file:

```bash
# Required
SESSION_SECRET=<generate-with-openssl-rand-hex-32>

# Optional: Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Optional: Email (Magic Links)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# App URL
APP_URL=http://localhost:3000
```

### Generate SESSION_SECRET

```bash
# Method 1: OpenSSL
openssl rand -hex 32

# Method 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 🏗️ Building

### Build Image

```bash
# Development
docker build -t markdown-notes:latest .

# Production with specific tag
docker build -t markdown-notes:1.0.0 .
```

### Build with Docker Compose

```bash
# Development
docker-compose build

# Production
docker-compose -f docker-compose.prod.yml build
```

## 🚀 Running

### Method 1: Docker Compose (Recommended)

#### Development

```bash
# Start in background
docker-compose up -d

# Start with logs
docker-compose up

# Stop
docker-compose down

# Stop and remove volumes (WARNING: deletes data)
docker-compose down -v
```

#### Production

```bash
# Start
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Stop
docker-compose -f docker-compose.prod.yml down
```

#### Production with Nginx

```bash
# Start with nginx reverse proxy
docker-compose -f docker-compose.prod.yml --profile with-nginx up -d

# Access via nginx on port 80
open http://localhost
```

### Method 2: Docker Run (Manual)

```bash
# Create network
docker network create notes-network

# Create volumes
docker volume create vaults-data
docker volume create db-data

# Run container
docker run -d \
  --name markdown-notes \
  --network notes-network \
  -p 3000:3000 \
  -e SESSION_SECRET="your-secret-here" \
  -v vaults-data:/app/vaults \
  -v db-data:/app \
  markdown-notes:latest

# View logs
docker logs -f markdown-notes

# Stop
docker stop markdown-notes
docker rm markdown-notes
```

## 📊 Managing the Application

### View Logs

```bash
# All logs
docker-compose logs

# Follow logs (live)
docker-compose logs -f

# Specific service
docker-compose logs -f app

# Last 100 lines
docker-compose logs --tail=100
```

### Shell Access

```bash
# Enter running container
docker-compose exec app sh

# Or with docker
docker exec -it markdown-notes-app sh
```

### Health Check

```bash
# Check container health
docker ps

# Manual health check
curl http://localhost:3000/auth/me
```

## 💾 Data Persistence

### Volumes

The app uses two volumes:

1. **vaults-data**: User notes and files
   - Location: `/app/vaults`
   - Contains: All user markdown files

2. **db-data**: Database and sessions
   - Location: `/app`
   - Contains: `notes.db`, session data

### Backup

```bash
# Backup vaults
docker run --rm \
  -v markdown-notes_vaults-data:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/vaults-$(date +%Y%m%d).tar.gz -C /data .

# Backup database
docker run --rm \
  -v markdown-notes_db-data:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/db-$(date +%Y%m%d).tar.gz -C /data notes.db
```

### Restore

```bash
# Restore vaults
docker run --rm \
  -v markdown-notes_vaults-data:/data \
  -v $(pwd)/backups:/backup \
  alpine sh -c "cd /data && tar xzf /backup/vaults-20240101.tar.gz"

# Restore database
docker run --rm \
  -v markdown-notes_db-data:/data \
  -v $(pwd)/backups:/backup \
  alpine sh -c "cd /data && tar xzf /backup/db-20240101.tar.gz"
```

## 🔄 Updating

### Update to New Version

```bash
# Pull latest code
git pull origin main

# Rebuild image
docker-compose build

# Restart with new image
docker-compose up -d

# Check logs
docker-compose logs -f
```

### Zero-Downtime Update

```bash
# Start new instance
docker-compose up -d --no-deps --build app

# Old instance automatically replaced
```

## 🐛 Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs app

# Check container status
docker ps -a

# Inspect container
docker inspect markdown-notes-app
```

### Permission Issues

```bash
# Fix volume permissions
docker-compose down
docker volume rm markdown-notes_vaults-data
docker volume rm markdown-notes_db-data
docker-compose up -d
```

### Port Already in Use

```bash
# Find what's using port 3000
lsof -i :3000

# Or change port in docker-compose.yml
ports:
  - "3001:3000"  # Use port 3001 instead
```

### Database Locked

```bash
# Stop container
docker-compose down

# Remove database lock
docker run --rm \
  -v markdown-notes_db-data:/data \
  alpine rm -f /data/notes.db-journal

# Restart
docker-compose up -d
```

## 🔒 Security Best Practices

### 1. Use Secrets Management

```bash
# Docker secrets (Swarm mode)
echo "my-secret" | docker secret create session_secret -

# Or use .env files (not committed to git)
```

### 2. Run as Non-Root

The Dockerfile already creates a `nodejs` user (UID 1001).

### 3. Limit Resources

```yaml
deploy:
  resources:
    limits:
      cpus: '1'
      memory: 512M
```

### 4. Use HTTPS in Production

Configure nginx with SSL certificates (see `nginx.conf`).

### 5. Regular Updates

```bash
# Update base image
docker pull node:18-alpine

# Rebuild
docker-compose build --no-cache
```

## 📈 Monitoring

### Container Stats

```bash
# Real-time stats
docker stats markdown-notes-app

# With docker-compose
docker-compose stats
```

### Health Monitoring

```bash
# Check health status
docker inspect --format='{{.State.Health.Status}}' markdown-notes-app

# View health check logs
docker inspect --format='{{json .State.Health}}' markdown-notes-app | jq
```

## 🌐 Production Deployment Examples

### Deploy to Docker Swarm

```bash
# Initialize swarm
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.prod.yml notes

# View services
docker service ls

# Scale
docker service scale notes_app=3
```

### Deploy to Kubernetes

```bash
# Generate kubernetes manifests
kompose convert -f docker-compose.prod.yml

# Apply to cluster
kubectl apply -f .

# Check status
kubectl get pods
```

### Deploy to Cloud Platforms

#### AWS ECS

```bash
# Install ECS CLI
# Create cluster
ecs-cli up --cluster notes-cluster

# Deploy
ecs-cli compose -f docker-compose.prod.yml up
```

#### Google Cloud Run

```bash
# Build and push
docker build -t gcr.io/PROJECT_ID/markdown-notes .
docker push gcr.io/PROJECT_ID/markdown-notes

# Deploy
gcloud run deploy markdown-notes \
  --image gcr.io/PROJECT_ID/markdown-notes \
  --platform managed
```

#### DigitalOcean App Platform

```bash
# Push to registry
docker tag markdown-notes registry.digitalocean.com/YOUR_REGISTRY/markdown-notes
docker push registry.digitalocean.com/YOUR_REGISTRY/markdown-notes

# Deploy via UI or doctl
```

## 🔧 Advanced Configuration

### Multi-Stage Build Optimization

The Dockerfile uses multi-stage builds:
- **Stage 1 (builder)**: Install dependencies
- **Stage 2 (production)**: Copy only what's needed

### Custom Network

```yaml
networks:
  notes-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.25.0.0/16
```

### Volume Mounts (Development)

```yaml
volumes:
  - ./public:/app/public  # Live reload frontend
  - ./server.js:/app/server.js  # Live reload backend
```

### Environment-Specific Configs

```bash
# Development
docker-compose -f docker-compose.yml up

# Staging
docker-compose -f docker-compose.yml -f docker-compose.staging.yml up

# Production
docker-compose -f docker-compose.prod.yml up
```

## 📝 Useful Commands

```bash
# Remove all stopped containers
docker-compose down

# Remove all unused images
docker image prune -a

# Remove all unused volumes
docker volume prune

# Full cleanup (WARNING: removes everything)
docker system prune -a --volumes

# Export image
docker save markdown-notes:latest | gzip > markdown-notes.tar.gz

# Import image
docker load < markdown-notes.tar.gz

# View image size
docker images markdown-notes

# Inspect image layers
docker history markdown-notes:latest
```

## 🎯 Performance Tuning

### Optimize Image Size

Current optimizations:
- Multi-stage build
- Alpine Linux base (small)
- Production dependencies only
- .dockerignore excludes unnecessary files

**Result**: ~150MB image

### Memory Limits

```yaml
deploy:
  resources:
    limits:
      memory: 512M
    reservations:
      memory: 256M
```

### CPU Limits

```yaml
deploy:
  resources:
    limits:
      cpus: '1'
    reservations:
      cpus: '0.5'
```

## ✅ Checklist for Production

- [ ] Generate strong SESSION_SECRET
- [ ] Configure SMTP for magic links
- [ ] Set up Google OAuth (optional)
- [ ] Enable HTTPS with nginx
- [ ] Set up regular backups
- [ ] Configure log rotation
- [ ] Set resource limits
- [ ] Enable health checks
- [ ] Monitor container stats
- [ ] Set up alerts
- [ ] Document deployment process
- [ ] Test disaster recovery

## 🆘 Getting Help

**Container logs show errors?**
- Check environment variables are set
- Verify volumes have correct permissions
- Check port isn't already in use

**Can't access the app?**
- Verify container is running: `docker ps`
- Check port mapping: `docker port markdown-notes-app`
- Test health: `curl http://localhost:3000/auth/me`

**Database issues?**
- Check volume exists: `docker volume ls`
- Verify permissions: `docker exec markdown-notes-app ls -la /app`
- Check logs: `docker-compose logs app`

## 🎉 You're Ready!

Your markdown notes app is now running in Docker with:
- ✅ Isolated environment
- ✅ Easy deployment
- ✅ Data persistence
- ✅ Health monitoring
- ✅ Production-ready configuration

Start the app:
```bash
docker-compose up -d
```

Access it:
```bash
open http://localhost:3000
```

Happy note-taking in Docker! 🐳📝
