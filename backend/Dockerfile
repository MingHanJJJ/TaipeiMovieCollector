FROM python:3.14-slim
WORKDIR /api
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
USER nobody
EXPOSE 8000
CMD ["fastapi", "run", "app/main.py", "--port", "8000"]
