import simplejson as json
import os, sys, re
from multiprocessing import Pool
import nltk
import numpy as np
from scipy.optimize import minimize
from scipy.spatial import procrustes
import h5py

from keras import backend as K
import tensorflow as tf

from sklearn.decomposition import PCA
from sklearn.manifold import MDS, smacof

from flask import Flask, jsonify, request
from flask_cors import CORS

from gvaemodel.vis_vae import VisVAE, get_rules, get_specs
from gvaemodel.vis_grammar import VisGrammar
from LLMVisual.Initialize import VegaLiteGenerator
port = 5000
rulesfile = './gvaemodel/rules-cfg.txt'
modelsave = './gvaemodel/vae_H256_D256_C444_333_L20_B200.hdf5'
# rulesfile = './gvaemodel/rules-cfg2.txt'
# modelsave = './gvaemodel/vae_H256_D256_C888_333_L20_B200.hdf5'
# rulesfile = './gvaemodel/rules-cfg4.txt'
# modelsave = './gvaemodel/vae_H256_D256_C888_333_L20_B200.hdf5'


m = re.search(r'_L(\d+)_', modelsave)

# MAX_LEN = 20   #潜在空间的维度20
MAX_LEN = 20
LATENT = int(m.group(1))

# rules = []
# with open(rulesfile, 'r') as inputs:
#     for line in inputs:
#         line = line.strip()
#         rules.append(line)

# visvae = VisVAE(modelsave, rules, MAX_LEN, LATENT)
# graph = tf.get_default_graph()

# pca = PCA(n_components=2)

visvae = None
graph = None
sess = None
pca = None

app = Flask(__name__)
CORS(app)


class InvalidUsage(Exception):
    status_code = 400

    def __init__(self, message, status_code=None, payload=None):
        Exception.__init__(self)
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        self.payload = payload

    def to_dict(self):
        rv = dict(self.payload or ())
        rv['message'] = self.message
        return rv

@app.errorhandler(InvalidUsage)
def handle_invalid_usage(error):
    response = jsonify(error.to_dict())
    response.status_code = error.status_code
    return response

@app.route('/encode', methods=['POST'])
def encode():
    specs = request.get_json()
    try:
        with graph.as_default():
            tf.keras.backend.set_session(sess)
            z = visvae.encode(specs)
    except Exception as e:
        raise InvalidUsage(e.message)
    return jsonify(z.tolist())

@app.route('/decode', methods=['POST'])
def decode():
    z = np.array(request.get_json())
    try:
        with graph.as_default():
            tf.keras.backend.set_session(sess)
            specs = visvae.decode(z)
    except Exception as e:
        raise InvalidUsage(e.message)
    return jsonify(specs)


@app.route('/decode_llm', methods=['POST'])
def decode_llm():
    vlg = VegaLiteGenerator()
    str = "我想要分析这个车辆数据集，参考以下只有设计属性的可视化图表，给出多种完整的可视化图表，并进行解释 只有设计属性的可视化图表："
    vegas = request.get_json()[0]
    data = '''数据集： "attributes": [["Miles_per_Gallon", "num", "quantitative"], ["Cylinders", "num", "ordinal"], ["Displacement", "num", "quantitative"], ["Horsepower", "num", "quantitative"], ["Weight_in_lbs", "num", "quantitative"],["Acceleration", "num", "quantitative"], ["Year", "str", "temporal"], ["Origin", "str", "nominal"]], "data": [ { "Name":"chevrolet chevelle malibu", "Miles_per_Gallon":18, "Cylinders":8, "Displacement":307, "Horsepower":130, "Weight_in_lbs":3504, "Acceleration":12, "Year":"1970-01-01", "Origin":"USA" }, { "Name":"buick skylark 320", "Miles_per_Gallon":15, "Cylinders":8, "Displacement":350, "Horsepower":165, "Weight_in_lbs":3693, "Acceleration":11.5, "Year":"1970-01-01", "Origin":"USA" }, { "Name":"plymouth satellite", "Miles_per_Gallon":18, "Cylinders":8, "Displacement":318, "Horsepower":150, "Weight_in_lbs":3436, "Acceleration":11, "Year":"1970-01-01", "Origin":"USA" }, { "Name":"amc rebel sst", "Miles_per_Gallon":16, "Cylinders":8, "Displacement":304, "Horsepower":150, "Weight_in_lbs":3433, "Acceleration":12, "Year":"1970-01-01", "Origin":"USA" }, { "Name":"ford torino", "Miles_per_Gallon":17, "Cylinders":8, "Displacement":302, "Horsepower":140, "Weight_in_lbs":3449, "Acceleration":10.5, "Year":"1970-01-01", "Origin":"USA" }, { "Name":"ford galaxie 500", "Miles_per_Gallon":15, "Cylinders":8, "Displacement":429, "Horsepower":198, "Weight_in_lbs":4341, "Acceleration":10, "Year":"1970-01-01", "Origin":"USA" }, { "Name":"chevrolet impala", "Miles_per_Gallon":14, "Cylinders":8, "Displacement":454, "Horsepower":220, "Weight_in_lbs":4354, "Acceleration":9, "Year":"1970-01-01", "Origin":"USA" }, { "Name":"plymouth fury iii", "Miles_per_Gallon":14, "Cylinders":8, "Displacement":440, "Horsepower":215, "Weight_in_lbs":4312, "Acceleration":8.5, "Year":"1970-01-01", "Origin":"USA" }, { "Name":"pontiac catalina", "Miles_per_Gallon":14, "Cylinders":8, "Displacement":455, "Horsepower":225, "Weight_in_lbs":4425, "Acceleration":10, "Year":"1970-01-01", "Origin":"USA" }, { "Name":"amc ambassador dpl", "Miles_per_Gallon":15, "Cylinders":8, "Displacement":390, "Horsepower":190, "Weight_in_lbs":3850, "Acceleration":8.5, "Year":"1970-01-01", "Origin":"USA" }, { "Name":"citroen ds-21 pallas", "Miles_per_Gallon":null, "Cylinders":4, "Displacement":133, "Horsepower":115, "Weight_in_lbs":3090, "Acceleration":17.5, "Year":"1970-01-01", "Origin":"Europe" }, { "Name":"chevrolet chevelle concours (sw)", "Miles_per_Gallon":null, "Cylinders":8, "Displacement":350, "Horsepower":165, "Weight_in_lbs":4142, "Acceleration":11.5, "Year":"1970-01-01", "Origin":"USA" }, { "Name":"ford torino (sw)", "Miles_per_Gallon":null, "Cylinders":8, "Displacement":351, "Horsepower":153, "Weight_in_lbs":4034, "Acceleration":11, "Year":"1970-01-01", "Origin":"USA" }, { "Name":"plymouth satellite (sw)", "Miles_per_Gallon":null, "Cylinders":8, "Displacement":383, "Horsepower":175, "Weight_in_lbs":4166, "Acceleration":10.5, "Year":"1970-01-01", "Origin":"USA" }, { "Name":"amc rebel sst (sw)", "Miles_per_Gallon":null, "Cylinders":8, "Displacement":360, "Horsepower":175, "Weight_in_lbs":3850, "Acceleration":11, "Year":"1970-01-01", "Origin":"USA" }, { "Name":"dodge challenger se", "Miles_per_Gallon":15, "Cylinders":8, "Displacement":383, "Horsepower":170, "Weight_in_lbs":3563, "Acceleration":10, "Year":"1970-01-01", "Origin":"USA" }, { "Name":"plymouth 'cuda 340", "Miles_per_Gallon":14, "Cylinders":8, "Displacement":340, "Horsepower":160, "Weight_in_lbs":3609, "Acceleration":8, "Year":"1970-01-01", "Origin":"USA" }, { "Name":"ford mustang boss 302", "Miles_per_Gallon":null, "Cylinders":8, "Displacement":302, "Horsepower":140, "Weight_in_lbs":3353, "Acceleration":8, "Year":"1970-01-01", "Origin":"USA" } ]'''
    vlg.generate(str+vegas+data)
    codes = vlg.get_codes()

    return jsonify(codes)

@app.route('/orientate', methods=['POST'])
def orientate():
    locations = request.get_json()
    mt1, mt2, disparity = procrustes(locations[0], locations[1]) 
    return jsonify(mt2.tolist())

@app.route('/pca', methods=['POST'])
def pcaproject():
    global pca
    pca = PCA(n_components=2)
    x = np.array(request.get_json())
    y = pca.fit_transform(x)
    return jsonify(y.tolist())

@app.route('/invpca', methods=['POST'])
def invpcaproject():
    global pca
    y = np.array(request.get_json())
    x = pca.inverse_transform(y)
    return jsonify(x.tolist())

@app.route('/mds', methods=['POST'])
def mdsproject():
    distm = np.array(request.get_json())
    mds = MDS(n_components=2, dissimilarity='precomputed', random_state=13, max_iter=3000, eps=1e-9)
    y = mds.fit(distm).embedding_
    # res = smacof(distm, n_components=2, random_state=13, max_iter=3000, eps=1e-9)
    # y = res[0]    
    return jsonify(y.tolist())

@app.route('/invmds', methods=['POST'])
def invmdsproject():
    inputdata = request.get_json()
    ps = np.array(inputdata['points'])
    dsall = np.array(inputdata['distances'])
    
    #res = myminimize((ps, dsall[0]))
    pool = Pool(8)
    res = pool.map(myminimize, [(ps, ds) for ds in dsall])
    res = [r.tolist() for r in res]
    pool.close()
    pool.join()
    return jsonify(res)

def myminimize(args):
    ps, ds = args
    x0 = np.random.random_sample(ps[0].shape)
    res = minimize(objfun, x0, args=(ps, ds), tol=1e-9, options={'maxiter':3000})
    return res.x

def objfun(x, ps, ds):
    d = np.tile(x, (ps.shape[0], 1)) - ps
    d = np.sum(np.square(d), axis=1)
    diff = np.sqrt(d) - ds
    return np.sum(np.square(diff))

    # try:
    #     with graph.as_default():
    #         tf.keras.backend.set_session(sess)
    #         specs = visvae.decode(z)
    # except Exception as e:
    #     raise InvalidUsage(e.message)
    return jsonify(codes)
if __name__ == '__main__':
    rules = []
    with open(rulesfile, 'r') as inputs: #读cfg文件
        for line in inputs:
            line = line.strip()   #删除头尾的空格
            rules.append(line)

    # sess一致方法
    sess = tf.Session()  #创建一个新的TensorFlow会话
    tf.keras.backend.set_session(sess)

    visvae = VisVAE(modelsave, rules, MAX_LEN, LATENT)
    #注意 modelsave = './gvaemodel/vae_H256_D256_C444_333_L20_B200.hdf5'
    # MAX_LEN = 20
    # LATENT = int(m.group(1))

    graph = tf.get_default_graph() #返回当前线程的默认图形

    pca = PCA(n_components=2)  #主成分分析

    app.run(host="127.0.0.1",port=port, debug=False) #在本地开发服务器上运行应用进程
