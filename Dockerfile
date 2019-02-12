FROM node:11.9-alpine
WORKDIR /app
COPY . .
RUN npm ci
VOLUME ["/conf"]
ENTRYPOINT ["node", "main"]
CMD ["--config", "/conf/config.yaml", "--db", "/conf/db.sqlite"]
