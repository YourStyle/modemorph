FROM alpine:3.20
RUN apk add --no-cache curl tzdata
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENV TZ=UTC
ENTRYPOINT ["/entrypoint.sh"]
