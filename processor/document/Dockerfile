FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends python3 qpdf && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY contract.mjs runner.mjs server.mjs office.py ./

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.mjs"]
