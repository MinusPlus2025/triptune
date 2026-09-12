FROM node:24-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production
ENV PORT=7860
ENV HOST=0.0.0.0
ENV TRIPTUNE_DATA_DIR=/mnt/workspace/triptune
EXPOSE 7860
CMD ["node", "backend/server.js"]
