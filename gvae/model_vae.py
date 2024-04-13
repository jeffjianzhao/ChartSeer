 ##################################################
## Generic VAE model
## This code is based on https://github.com/mkusner/grammarVAE
##################################################
## Author: Jian Zhao
## Contact: jeffjianzhao@gmail.com
##################################################

from keras import backend as K
from keras import objectives
from keras import optimizers
from keras.models import Model
from keras.layers import Input, Dense, Lambda
from keras.layers.core import Dense, Activation, Flatten, RepeatVector
from keras.layers.wrappers import TimeDistributed
from keras.layers.recurrent import GRU, LSTM
from keras.layers.convolutional import Convolution1D
from keras.layers.normalization import BatchNormalization
import tensorflow as tf

from vis_grammar import VisGrammar

# defaulthypers = {'hidden': 256, 'dense': 256, 'conv1': [8, 3], 'conv2': [8, 3], 'conv3': [8, 3]}


class ModelVAE():

    autoencoder = None
    
    def create(self, rules, latent_rep_size, max_length, hypers, weights_file = None):
        self.grammar = VisGrammar(rules)
        self.rules_length = len(rules)
        self.max_length = max_length
        self.masks_K = K.variable(self.grammar.masks)
        self.ind_of_ind_K = K.variable(self.grammar.ind_of_ind)

        self.hypers = hypers
        
        x = Input(shape=(self.max_length, self.rules_length))
        _, z = self._buildEncoder(x, latent_rep_size, self.max_length)
        self.encoder = Model(x, z)

        encoded_input = Input(shape=(latent_rep_size,))
        self.decoder = Model(
            encoded_input,
            self._buildDecoder(encoded_input, latent_rep_size, self.max_length, self.rules_length)
        )

        x1 = Input(shape=(self.max_length, self.rules_length))
        vae_loss, z1 = self._buildEncoder(x1, latent_rep_size, self.max_length)
        self.autoencoder = Model(
            x1,
            self._buildDecoder(z1, latent_rep_size, self.max_length, self.rules_length)
        )

        x2 = Input(shape=(self.max_length, self.rules_length))
        (z_m, z_l_v) = self._encoderMeanVar(x2, latent_rep_size, self.max_length)
        self.encoderMV = Model(inputs=x2, outputs=[z_m, z_l_v])

        if weights_file:
            self.autoencoder.load_weights(weights_file)
            self.encoder.load_weights(weights_file, by_name = True)
            self.decoder.load_weights(weights_file, by_name = True)
            self.encoderMV.load_weights(weights_file, by_name = True)
            
        adam = optimizers.Adam(lr = 0.0001)
        self.autoencoder.compile(optimizer = adam, loss = vae_loss, metrics = ['accuracy'])
        self.autoencoder.summary()


    def _encoderMeanVar(self, x, latent_rep_size, max_length, epsilon_std = 0.01):
        h = Convolution1D(self.hypers['conv1'][0], self.hypers['conv1'][1], activation = 'relu', name='conv_1')(x)
        h = BatchNormalization(name='batch_1')(h)
        h = Convolution1D(self.hypers['conv2'][0], self.hypers['conv2'][1], activation = 'relu', name='conv_2')(h)
        h = BatchNormalization(name='batch_2')(h)
        h = Convolution1D(self.hypers['conv3'][0], self.hypers['conv3'][1], activation = 'relu', name='conv_3')(h) 
        h = BatchNormalization(name='batch_3')(h)
        h = Flatten(name='flatten_1')(h)
        h = Dense(self.hypers['dense'], activation = 'relu', name='dense_1')(h)

        z_mean = Dense(latent_rep_size, name='z_mean', activation = 'linear')(h)
        z_log_var = Dense(latent_rep_size, name='z_log_var', activation = 'linear')(h)

        return (z_mean, z_log_var) 

    def _buildEncoder(self, x, latent_rep_size, max_length, epsilon_std = 0.01):
        h = Convolution1D(self.hypers['conv1'][0], self.hypers['conv1'][1], activation = 'relu', name='conv_1')(x)
        h = BatchNormalization(name='batch_1')(h)
        h = Convolution1D(self.hypers['conv2'][0], self.hypers['conv2'][1], activation = 'relu', name='conv_2')(h)
        h = BatchNormalization(name='batch_2')(h)
        h = Convolution1D(self.hypers['conv3'][0], self.hypers['conv3'][1], activation = 'relu', name='conv_3')(h) 
        h = BatchNormalization(name='batch_3')(h)

        h = Flatten(name='flatten_1')(h)
        h = Dense(self.hypers['dense'], activation = 'relu', name='dense_1')(h)

        def sampling(args):
            z_mean_, z_log_var_ = args
            batch_size = K.shape(z_mean_)[0]
            epsilon = K.random_normal(shape=(batch_size, latent_rep_size), mean=0., stddev=epsilon_std)
            return z_mean_ + K.exp(z_log_var_ / 2) * epsilon

        z_mean = Dense(latent_rep_size, name='z_mean', activation = 'linear')(h)
        z_log_var = Dense(latent_rep_size, name='z_log_var', activation = 'linear')(h)

        # this function is the main change.
        # essentially we mask the training data so that we are only allowed to apply
        # future rules based on the current non-terminal
        def conditional(x_true, x_pred):
            most_likely = K.argmax(x_true)
            most_likely = tf.reshape(most_likely,[-1]) # flatten most_likely
            ix2 = tf.expand_dims(tf.gather(self.ind_of_ind_K, most_likely),1) # index ind_of_ind with res
            ix2 = tf.cast(ix2, tf.int32) # cast indices as ints 
            M2 = tf.gather_nd(self.masks_K, ix2) # get slices of masks_K with indices
            M3 = tf.reshape(M2, [-1, max_length, self.rules_length]) # reshape them
            P2 = tf.multiply(K.exp(x_pred), M3) # apply them to the exp-predictions
            P2 = tf.div(P2,K.sum(P2, axis=-1, keepdims=True)) # normalize predictions
            return P2

        def vae_loss(x, x_decoded_mean):
            #x_decoded_mean = conditional(x, x_decoded_mean) # we add this new function to the loss
            x_decoded_mean = K.flatten(x_decoded_mean)
            x = K.flatten(x)
            x_decoded_mean = K.flatten(x_decoded_mean)
            xent_loss = max_length * objectives.binary_crossentropy(x, x_decoded_mean)
            kl_loss = - 0.5 * K.mean(1 + z_log_var - K.square(z_mean) - K.exp(z_log_var), axis = -1)
            return xent_loss + kl_loss

        return (vae_loss, Lambda(sampling, output_shape=(latent_rep_size,), name='lambda')([z_mean, z_log_var]))

    def _buildDecoder(self, z, latent_rep_size, max_length, rules_length):
        h = BatchNormalization(name='batch_4')(z)
        h = Dense(latent_rep_size, name='latent_input', activation = 'relu')(h)
        h = RepeatVector(max_length, name='repeat_vector')(h)
        # h = LSTM(self.hypers['hidden'], return_sequences = True, name='lstm_1')(h)
        # h = LSTM(self.hypers['hidden'], return_sequences = True, name='lstm_2')(h)
        # h = LSTM(self.hypers['hidden'], return_sequences = True, name='lstm_3')(h)
        h = GRU(self.hypers['hidden'], return_sequences = True, name='gru_1')(h)
        h = GRU(self.hypers['hidden'], return_sequences = True, name='gru_2')(h)
        h = GRU(self.hypers['hidden'], return_sequences = True, name='gru_3')(h)
        
        # return TimeDistributed(Dense(rules_length), name='decoded_mean')(h) # don't do softmax, we do this in the loss now
        return TimeDistributed(Dense(rules_length, activation='sigmoid'), name='decoded_mean')(h)


    def save(self, filename):
        self.autoencoder.save_weights(filename)
    
    def load(self, rules, weights_file, latent_rep_size, max_length, hypers):
        self.create(rules, latent_rep_size = latent_rep_size, max_length = max_length, hypers = hypers, weights_file = weights_file)
